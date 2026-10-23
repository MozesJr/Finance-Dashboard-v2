import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { extractRuleKey, getTodayInJakarta, normalizeText, toDateString } from 'shared';
import { CategoriesService } from '../../../categories/categories.service';
import { MerchantRulesService } from '../../../merchant-rules/merchant-rules.service';
import { TransactionResponse, TransactionsService } from '../../../transactions/transactions.service';
import { WalletsService } from '../../../wallets/wallets.service';
import { BotPendingRepository } from '../../bot-pending.repository';
import { formatDateId, renderDraft, summarizeTx } from '../format';
import { getErrorText } from '../util';
import { BotReply, BotUser, edit, InlineButton } from '../types';

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const GONE = 'Draft tidak ditemukan atau sudah kedaluwarsa. Kirim transaksinya lagi.';

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Aksi tombol inline: s=simpan, x=batal, c=kategori, w=dompet, d=tanggal, b=kembali, p=pilih dompet, uy/un=undo. */
@Injectable()
export class DraftCallbackHandler {
  private readonly logger = new Logger(DraftCallbackHandler.name);

  constructor(
    private transactions: TransactionsService,
    private wallets: WalletsService,
    private categories: CategoriesService,
    private rules: MerchantRulesService,
    private pending: BotPendingRepository,
  ) {}

  async handle(user: BotUser, data: string): Promise<BotReply[]> {
    const [action, id, arg] = data.split(':');
    if (!action || !id && action !== 'un') return [edit('Tombol ini sudah tidak berlaku.')];
    try {
      switch (action) {
        case 's':
          return await this.save(user, id);
        case 'x':
          return await this.cancel(user, id);
        case 'c':
          return arg === undefined ? await this.categoryPicker(user, id) : await this.pickCategory(user, id, Number(arg));
        case 'w':
          return arg === undefined ? await this.walletPicker(user, id) : await this.pickWallet(user, id, Number(arg));
        case 'd':
          return arg === undefined ? await this.datePicker(user, id) : await this.pickDate(user, id, Number(arg));
        case 'b':
          return await this.preview(user, id);
        case 'p':
          return await this.pickPendingWallet(user, id, Number(arg));
        case 'uy':
          return await this.undo(user, id);
        case 'un':
          return [edit('Oke, transaksi dipertahankan.')];
        default:
          return [edit('Tombol ini sudah tidak berlaku.')];
      }
    } catch (error) {
      if (error instanceof NotFoundException) return [edit(GONE)];
      this.logger.warn(`Callback ${action} gagal: ${getErrorText(error)}`);
      return [edit(`⚠️ ${getErrorText(error)}`)];
    }
  }

  private today(): string {
    return toDateString(getTodayInJakarta());
  }

  /** Draft milik user ini (404 untuk milik orang lain / tidak ada). */
  private load(user: BotUser, id: string): Promise<TransactionResponse> {
    return this.transactions.get(user.userId, id);
  }

  private renderPreview(tx: TransactionResponse): BotReply {
    const m = renderDraft(tx, this.today());
    return edit(m.text, m.buttons);
  }

  private async preview(user: BotUser, id: string): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status !== 'DRAFT') return [edit(`✅ Sudah tersimpan: ${summarizeTx(tx)}`)];
    return [this.renderPreview(tx)];
  }

  private async save(user: BotUser, id: string): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status === 'CONFIRMED') return [edit(`✅ Sudah tersimpan: ${summarizeTx(tx)}`)];

    if (tx.type !== 'TRANSFER' && !tx.categoryId) {
      return this.categoryPicker(user, id, 'Pilih kategori dulu sebelum menyimpan:');
    }
    try {
      const saved = await this.transactions.confirmDraft(user.userId, id);
      return [edit(`✅ Tersimpan: ${summarizeTx(saved)}\nBatalkan dengan /undo (dalam 24 jam).`)];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const m = renderDraft(tx, this.today());
      return [edit(`⚠️ ${getErrorText(error)}\n\n${m.text}`, m.buttons)];
    }
  }

  private async cancel(user: BotUser, id: string): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status === 'CONFIRMED') return [edit(`Transaksi ini sudah tersimpan, pakai /undo untuk membatalkan.\n${summarizeTx(tx)}`)];
    await this.transactions.discardDraft(user.userId, id);
    return [edit('❌ Draft dibatalkan.')];
  }

  // ----- kategori

  private async categoryPicker(user: BotUser, id: string, heading = 'Pilih kategori:'): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status !== 'DRAFT') return [edit(`✅ Sudah tersimpan: ${summarizeTx(tx)}`)];
    if (tx.type === 'TRANSFER') return [this.renderPreview(tx)];
    const list = await this.categories.list(user.userId, tx.type as 'INCOME' | 'EXPENSE');
    const buttons: InlineButton[][] = [];
    list.forEach((c, idx) => {
      const btn = { text: `${c.icon ? `${c.icon} ` : ''}${c.name}`, data: `c:${id}:${idx}` };
      if (idx % 2 === 0) buttons.push([btn]);
      else buttons[buttons.length - 1].push(btn);
    });
    buttons.push([{ text: '⬅ Kembali', data: `b:${id}` }]);
    return [edit(heading, buttons)];
  }

  private async pickCategory(user: BotUser, id: string, index: number): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status !== 'DRAFT') return [edit(`✅ Sudah tersimpan: ${summarizeTx(tx)}`)];
    const list = await this.categories.list(user.userId, tx.type as 'INCOME' | 'EXPENSE');
    const chosen = list[index];
    if (!chosen) return this.categoryPicker(user, id, 'Pilihan kategori tidak valid. Pilih lagi:');

    const updated = await this.transactions.updateDraft(user.userId, id, { categoryId: chosen.id });

    // Belajar dari koreksi: kata kunci deskripsi → kategori pilihan user.
    const key = extractRuleKey(normalizeText(tx.merchant ?? ''));
    if (key) {
      try {
        await this.rules.learn(user.userId, key, chosen.id);
      } catch (error) {
        this.logger.warn(`Gagal menyimpan rule: ${getErrorText(error)}`);
      }
    }
    return [this.renderPreview(updated)];
  }

  // ----- dompet

  private async walletPicker(user: BotUser, id: string): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status !== 'DRAFT') return [edit(`✅ Sudah tersimpan: ${summarizeTx(tx)}`)];
    const list = await this.wallets.list(user.userId, false);
    const buttons: InlineButton[][] = list.map((w, idx) => [{ text: `👛 ${w.name}`, data: `w:${id}:${idx}` }]);
    buttons.push([{ text: '⬅ Kembali', data: `b:${id}` }]);
    return [edit(tx.type === 'TRANSFER' ? 'Pilih dompet asal:' : 'Pilih dompet:', buttons)];
  }

  private async pickWallet(user: BotUser, id: string, index: number): Promise<BotReply[]> {
    const list = await this.wallets.list(user.userId, false);
    const chosen = list[index];
    if (!chosen) return this.walletPicker(user, id);
    const updated = await this.transactions.updateDraft(user.userId, id, { walletId: chosen.id });
    return [this.renderPreview(updated)];
  }

  // ----- tanggal

  private async datePicker(user: BotUser, id: string): Promise<BotReply[]> {
    const tx = await this.load(user, id);
    if (tx.status !== 'DRAFT') return [edit(`✅ Sudah tersimpan: ${summarizeTx(tx)}`)];
    const today = this.today();
    const options = [0, 1, 2].map((n) => ({
      text: `${n === 0 ? 'Hari ini' : n === 1 ? 'Kemarin' : '2 hari lalu'} (${formatDateId(addDays(today, -n))})`,
      data: `d:${id}:${n}`,
    }));
    return [edit('Pilih tanggal:', [...options.map((o) => [o]), [{ text: '⬅ Kembali', data: `b:${id}` }]])];
  }

  private async pickDate(user: BotUser, id: string, offset: number): Promise<BotReply[]> {
    if (![0, 1, 2].includes(offset)) return this.datePicker(user, id);
    const updated = await this.transactions.updateDraft(user.userId, id, { date: addDays(this.today(), -offset) });
    return [this.renderPreview(updated)];
  }

  // ----- dompet untuk input yang tertunda

  private async pickPendingWallet(user: BotUser, pendingId: string, index: number): Promise<BotReply[]> {
    const payload = await this.pending.find(user.userId, pendingId);
    if (!payload) return [edit(GONE)];
    const list = await this.wallets.list(user.userId, false);
    const chosen = list[index];
    if (!chosen) return [edit('Pilihan dompet tidak valid. Kirim transaksinya lagi.')];

    const draft = await this.transactions.createDraft(
      user.userId,
      {
        type: payload.type,
        walletId: chosen.id,
        categoryId: payload.categoryId,
        amount: BigInt(payload.amount),
        date: payload.date,
        merchant: payload.description || null,
        note: payload.note ?? null,
        aiConfidence: payload.aiConfidence ?? null,
      },
      'TELEGRAM',
    );
    await this.pending.delete(user.userId, pendingId);
    return [this.renderPreview(draft)];
  }

  // ----- undo

  private async undo(user: BotUser, id: string): Promise<BotReply[]> {
    const last = await this.transactions.findLastConfirmedFrom(user.userId, 'TELEGRAM', UNDO_WINDOW_MS);
    if (!last || last.id !== id) {
      return [edit('Transaksi ini tidak bisa dibatalkan lagi (hanya transaksi Telegram terakhir dalam 24 jam).')];
    }
    await this.transactions.remove(user.userId, id);
    return [edit(`↩ Dibatalkan: ${summarizeTx(last)}`)];
  }
}
