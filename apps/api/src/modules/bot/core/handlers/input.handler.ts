import { Injectable, Logger } from '@nestjs/common';
import { formatMoneyId, getTodayInJakarta, parseTransactionMessage, suggestCategoryId, toDateString, type ParseContext } from 'shared';
import { CategoriesService, CategoryResponse } from '../../../categories/categories.service';
import { MerchantRulesService } from '../../../merchant-rules/merchant-rules.service';
import { TransactionsService } from '../../../transactions/transactions.service';
import { WalletsService } from '../../../wallets/wallets.service';
import { BotPendingRepository } from '../../bot-pending.repository';
import { renderDraft, TYPE_LABEL } from '../format';
import { BotReply, BotUser, send, sendMessage } from '../types';
import { getErrorText } from '../util';

export const MAX_LINES_PER_MESSAGE = 10;

/** Pesan teks biasa → satu atau lebih draft transaksi (berbasis aturan, tanpa LLM). */
@Injectable()
export class InputHandler {
  private readonly logger = new Logger(InputHandler.name);

  constructor(
    private transactions: TransactionsService,
    private wallets: WalletsService,
    private categories: CategoriesService,
    private rules: MerchantRulesService,
    private pending: BotPendingRepository,
  ) {}

  async handle(user: BotUser, text: string): Promise<BotReply[]> {
    const wallets = await this.wallets.list(user.userId, false);
    if (wallets.length === 0) {
      return [send('Kamu belum punya dompet. Buat dulu di web (menu Dompet), lalu coba lagi.')];
    }
    const [categories, rules] = await Promise.all([this.categories.list(user.userId), this.rules.list(user.userId)]);

    const today = toDateString(getTodayInJakarta());
    const ctx: ParseContext = { today, wallets: wallets.map((w) => ({ id: w.id, name: w.name })) };
    const allLines = parseTransactionMessage(text, ctx);
    if (allLines.length === 0) return [send('Kirim transaksi seperti: makan siang 35rb')];

    const lines = allLines.slice(0, MAX_LINES_PER_MESSAGE);
    const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? (wallets.length === 1 ? wallets[0].id : null);

    const replies: BotReply[] = [];
    const problems: string[] = [];

    for (const { line, result } of lines) {
      if (!result.ok) {
        problems.push(`• "${line}" → ${result.message}`);
        continue;
      }
      const tx = result.tx;
      const suggestion = suggestCategoryId(tx.normalized, tx.type, rules);
      const category = suggestion ? this.usableCategory(categories, suggestion.categoryId, tx.type) : null;
      const walletId = tx.walletId ?? defaultWalletId;

      try {
        if (!walletId) {
          const pendingId = await this.pending.create(user.userId, {
            type: tx.type,
            amount: tx.amount.toString(),
            date: tx.date,
            categoryId: category?.id ?? null,
            description: tx.description,
          });
          replies.push(this.walletQuestion(pendingId, wallets.map((w) => w.name), tx.type, tx.amount, tx.description));
          continue;
        }
        const draft = await this.transactions.createDraft(
          user.userId,
          {
            type: tx.type,
            walletId,
            toWalletId: tx.toWalletId,
            categoryId: category?.id ?? null,
            amount: tx.amount,
            date: tx.date,
            merchant: tx.description || null,
          },
          'TELEGRAM',
        );
        replies.push(sendMessage(renderDraft(draft, today)));
      } catch (error) {
        this.logger.warn(`Gagal membuat draft: ${getErrorText(error)}`);
        problems.push(`• "${line}" → ${getErrorText(error)}`);
      }
    }

    if (allLines.length > lines.length) {
      problems.push(`• ${allLines.length - lines.length} baris terakhir diabaikan (maks. ${MAX_LINES_PER_MESSAGE} per pesan).`);
    }
    if (problems.length > 0) {
      replies.push(send(`⚠️ Tidak bisa diproses:\n${problems.join('\n')}`));
    }
    return replies;
  }

  private usableCategory(categories: CategoryResponse[], id: string, type: string): CategoryResponse | null {
    const found = categories.find((c) => c.id === id);
    return found && found.type === type ? found : null;
  }

  private walletQuestion(pendingId: string, walletNames: string[], type: string, amount: bigint, description: string): BotReply {
    const label = TYPE_LABEL[type as keyof typeof TYPE_LABEL];
    const rows = walletNames.map((name, idx) => [{ text: `👛 ${name}`, data: `p:${pendingId}:${idx}` }]);
    return send(`Pakai dompet mana?\n${label} ${formatMoneyId(amount)}${description ? ` · ${description}` : ''}`, rows);
  }
}
