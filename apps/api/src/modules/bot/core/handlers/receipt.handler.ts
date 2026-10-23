import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { formatMoneyId, getTodayInJakarta, toDateString } from 'shared';
import { AiQuotaError, AiParseError, AiUnavailableError } from '../../../ai/ai.errors';
import { ReceiptsService, receiptItemLines } from '../../../receipts/receipts.service';
import { TransactionsService } from '../../../transactions/transactions.service';
import { WalletsService } from '../../../wallets/wallets.service';
import { BotPendingRepository } from '../../bot-pending.repository';
import { renderDraft } from '../format';
import { BotReply, BotUser, send, sendMessage } from '../types';
import { getErrorText } from '../util';

/** Foto struk → satu DRAFT pengeluaran (tidak pernah auto-confirm). */
@Injectable()
export class ReceiptHandler {
  private readonly logger = new Logger(ReceiptHandler.name);

  constructor(
    private receipts: ReceiptsService,
    private transactions: TransactionsService,
    private wallets: WalletsService,
    private pending: BotPendingRepository,
  ) {}

  async handle(user: BotUser, image: Buffer): Promise<BotReply[]> {
    const wallets = await this.wallets.list(user.userId, false);
    if (wallets.length === 0) return [send('Kamu belum punya dompet. Buat dulu di web (menu Dompet), lalu kirim struknya lagi.')];

    let parsed;
    try {
      parsed = await this.receipts.parseUpload(user.userId, image);
    } catch (error) {
      return [send(this.friendly(error))];
    }

    const today = toDateString(getTodayInJakarta());
    const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? (wallets.length === 1 ? wallets[0].id : null);
    const walletId = parsed.suggestedWalletId ?? defaultWalletId;
    const extraLines = ['🧾 Dari struk', ...receiptItemLines(parsed.items), ...parsed.notes.map((n) => `ℹ️ ${n}`)];
    const note = parsed.notes.join(' ').slice(0, 200) || null;
    const amount = BigInt(parsed.total);

    try {
      if (!walletId) {
        const pendingId = await this.pending.create(user.userId, {
          type: 'EXPENSE',
          amount: amount.toString(),
          date: parsed.date,
          categoryId: parsed.suggestedCategoryId,
          description: parsed.merchant ?? '',
          note,
          receiptId: parsed.receiptId,
          extraLines,
        });
        const rows = wallets.map((w, idx) => [{ text: `👛 ${w.name}`, data: `p:${pendingId}:${idx}` }]);
        return [send(`Pakai dompet mana?\nPengeluaran ${formatMoneyId(amount)}${parsed.merchant ? ` · ${parsed.merchant}` : ''}`, rows)];
      }
      const draft = await this.transactions.createDraft(
        user.userId,
        {
          type: 'EXPENSE',
          walletId,
          categoryId: parsed.suggestedCategoryId,
          amount,
          date: parsed.date,
          merchant: parsed.merchant,
          note,
          receiptId: parsed.receiptId,
        },
        'TELEGRAM',
      );
      return [sendMessage(renderDraft(draft, today, extraLines))];
    } catch (error) {
      this.logger.warn(`Gagal membuat draft dari struk: ${getErrorText(error)}`);
      return [send(`⚠️ Struk terbaca tetapi draft gagal dibuat: ${getErrorText(error)}`)];
    }
  }

  private friendly(error: unknown): string {
    if (error instanceof AiQuotaError) return `ℹ️ ${error.message}`;
    if (error instanceof AiUnavailableError) return 'Maaf, struk belum bisa dibaca sekarang (layanan AI sedang tidak tersedia). Coba lagi nanti atau catat manual, mis. "belanja 43500".';
    if (error instanceof AiParseError) return 'Maaf, isi struk tidak bisa dipahami. Coba foto yang lebih jelas atau catat manual.';
    if (error instanceof BadRequestException) return `⚠️ ${getErrorText(error)}`;
    this.logger.error(`Struk gagal diproses: ${error instanceof Error ? error.message : 'unknown'}`);
    return 'Maaf, struk gagal diproses. Coba lagi atau catat manual.';
  }
}
