import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatMoneyId, getTodayInJakarta, toDateString } from 'shared';
import { Checklist, ChecklistItem, PaydayService } from '../../../payday/payday.service';
import { TransactionsService } from '../../../transactions/transactions.service';
import { WalletsService } from '../../../wallets/wallets.service';
import { renderDraft } from '../format';
import { getErrorText } from '../util';
import { BotReply, BotUser, InlineButton, OutgoingMessage, edit, sendMessage } from '../types';

/** Data callback: pd:<s|e|n>:<posId|x>:<yymm>[:<idxDompet>] — selalu < 64 byte. */
const keyCode = (key: string): [string, string] => (key === 'inc' ? ['n', 'x'] : [key.slice(0, 1), key.slice(2)]);
const itemKeyOf = (code: string, id: string) => (code === 'n' ? 'inc' : `${code}:${id}`);
const toYymm = (periodKey: string) => `${periodKey.slice(2, 4)}${periodKey.slice(5, 7)}`;
const fromYymm = (yymm: string) => `20${yymm.slice(0, 2)}-${yymm.slice(2, 4)}`;

const rp = (v: string | bigint) => formatMoneyId(v);

/** Pesan checklist gajian + tombol. Fungsi murni: dipakai pemberi tahu dan penyunting setelah aksi. */
export function renderChecklist(c: Checklist, footer?: string): OutgoingMessage {
  const yymm = toYymm(c.period.key);
  const lines = [`💰 Gaji diterima — alokasi periode ${c.period.label}`, `Gaji ${rp(c.salary.amount)} masuk ke ${c.salary.walletName}.`];
  const buttons: InlineButton[][] = [];

  if (!c.hasPlan) {
    lines.push('Belum ada rencana alokasi. Atur di web (Tabungan → Alokasi).');
  } else if (c.items.length === 0) {
    lines.push('Tidak ada pos yang perlu ditindaklanjuti.');
  }

  for (const item of c.items) {
    const [code, id] = keyCode(item.key);
    const data = `pd:${code}:${id}:${yymm}`;
    const label = item.icon ? `${item.icon} ${item.name}` : item.name;
    switch (item.kind) {
      case 'SAVING':
        lines.push(`${item.done ? '✅' : '•'} ${label}: ${rp(item.amount)}`);
        buttons.push([{ text: item.done ? '✅ Sudah' : `Setor ${item.goalName ?? item.name} ${rp(item.amount)}`, data }]);
        break;
      case 'EXPENSE_SINGLE':
        lines.push(`${item.done ? '✅' : '•'} ${label}: ${rp(item.amount)}`);
        buttons.push([{ text: item.done ? '✅ Sudah' : `Catat ${item.name} ${rp(item.amount)}`, data }]);
        break;
      case 'EXPENSE_INFO':
        lines.push(`ℹ️ ${label}: anggaran ${rp(item.amount)} (beberapa kategori)`);
        break;
      case 'BILL':
        lines.push(`${item.done ? '✅' : '•'} 🧾 ${item.name}: ${rp(item.amount)} (jatuh tempo ${item.dueDate ?? ''})`);
        buttons.push([{ text: item.done ? '✅ Sudah' : `Bayar ${item.name} ${rp(item.amount)}`, data }]);
        break;
      case 'INCOME':
        lines.push(`${item.done ? '✅' : '⚠️'} Gaji di alokasi ${rp(item.planIncome ?? '0')} ≠ gaji diterima ${rp(item.amount)}`);
        buttons.push([{ text: item.done ? '✅ Sudah' : `Perbarui gaji di alokasi ke ${rp(item.amount)}`, data }]);
        break;
    }
  }
  if (footer) lines.push('', footer);
  return { text: lines.join('\n'), buttons };
}

@Injectable()
export class PaydayHandler {
  private readonly logger = new Logger(PaydayHandler.name);

  constructor(
    private payday: PaydayService,
    private transactions: TransactionsService,
    private wallets: WalletsService,
  ) {}

  async callback(user: BotUser, data: string): Promise<BotReply[]> {
    const [, code, id, yymm, arg] = data.split(':');
    if (!code || !yymm || !/^\d{4}$/.test(yymm)) return [edit('Tombol ini sudah tidak berlaku.')];
    const periodKey = fromYymm(yymm);
    try {
      if (code === 'b') return await this.show(user, periodKey);
      const itemKey = itemKeyOf(code === 'd' ? 's' : code, id); // 'd' = pilih dompet tujuan untuk pos tabungan
      const checklist = await this.payday.getChecklist(user.userId, periodKey);
      if (!checklist) return [edit('Gaji periode ini sudah tidak ada. Checklist dibatalkan.')];
      const item = checklist.items.find((i) => i.key === itemKey);
      if (!item) return [edit('Pos ini sudah tidak ada di rencana alokasi.')];

      if (code === 'd') return await this.pickDestination(user, checklist, item, periodKey, arg);
      if (!item.done && item.kind === 'SAVING' && item.needsDestination) return await this.destinationPicker(user, checklist, item, yymm);
      return await this.run(user, periodKey, item, null);
    } catch (error) {
      if (error instanceof NotFoundException) return [edit('Data tidak ditemukan atau sudah tidak berlaku.')];
      this.logger.warn(`Callback gajian gagal: ${getErrorText(error)}`);
      return [edit(`⚠️ ${getErrorText(error)}`)];
    }
  }

  /** Tampilkan ulang checklist (mengedit pesan). */
  private async show(user: BotUser, periodKey: string, footer?: string): Promise<BotReply[]> {
    const checklist = await this.payday.getChecklist(user.userId, periodKey);
    if (!checklist) return [edit('Belum ada gaji yang tercatat di periode ini.')];
    const m = renderChecklist(checklist, footer);
    return [edit(m.text, m.buttons)];
  }

  private async destinationPicker(user: BotUser, c: Checklist, item: ChecklistItem, yymm: string): Promise<BotReply[]> {
    const wallets = (await this.wallets.list(user.userId, false)).filter((w) => w.id !== c.salary.walletId);
    const [, id] = keyCode(item.key);
    const buttons: InlineButton[][] = wallets.slice(0, 20).map((w, i) => [{ text: `${w.name} (${rp(w.balance)})`, data: `pd:d:${id}:${yymm}:${i}` }]);
    buttons.push([{ text: '↩ Kembali', data: `pd:b:x:${yymm}` }]);
    return [edit(`Setor ${rp(item.amount)} ke ${item.goalName ?? item.name}. Simpan di dompet mana?`, buttons)];
  }

  private async pickDestination(user: BotUser, c: Checklist, item: ChecklistItem, periodKey: string, arg: string | undefined): Promise<BotReply[]> {
    const wallets = (await this.wallets.list(user.userId, false)).filter((w) => w.id !== c.salary.walletId);
    const wallet = wallets[Number(arg)];
    if (!wallet) return [edit('Pilihan dompet sudah tidak berlaku. Tekan tombol Setor lagi.')];
    return this.run(user, periodKey, item, wallet.id);
  }

  private async run(user: BotUser, periodKey: string, item: ChecklistItem, destinationWalletId: string | null): Promise<BotReply[]> {
    const result = await this.payday.runAction(user.userId, { itemKey: item.key, periodKey, destinationWalletId }, 'TELEGRAM');
    const replies = await this.show(user, periodKey, result.status === 'ALREADY' ? `ℹ️ ${result.message}` : `✅ ${result.message}`);
    if (result.status === 'DRAFT') {
      const tx = await this.transactions.get(user.userId, result.transactionId);
      replies.push(sendMessage(renderDraft(tx, toDateString(getTodayInJakarta()))));
    }
    return replies;
  }
}
