import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatMoneyId, getTodayInJakarta, toDateString } from 'shared';
import { BillResponse, BillsService } from '../../../bills/bills.service';
import { TransactionsService } from '../../../transactions/transactions.service';
import { formatDateId, renderDraft } from '../format';
import { getErrorText } from '../util';
import { BotReply, BotUser, OutgoingMessage, edit, send, sendMessage } from '../types';

const rp = (v: string | bigint) => formatMoneyId(v);
const MAX_LIST = 8;

const dueText = (b: BillResponse): string => {
  const when = formatDateId(b.nextDueDate);
  if (b.daysUntilDue < 0) return `${when} (lewat ${-b.daysUntilDue} hari)`;
  if (b.daysUntilDue === 0) return `${when} (hari ini)`;
  return `${when} (${b.daysUntilDue} hari lagi)`;
};

/** Pesan pengingat jatuh tempo + tombol. Murni; dipakai job pengingat. */
export function renderReminder(b: BillResponse, daysLeft: number, snoozed: boolean): OutgoingMessage {
  const head = snoozed ? '⏰ Pengingat tagihan (ditunda)' : '🧾 Pengingat tagihan';
  const when = daysLeft === 0 ? 'hari ini' : daysLeft < 0 ? `sudah lewat ${-daysLeft} hari` : `H-${daysLeft}`;
  const lines = [
    head,
    `${b.name} ${rp(b.amount)} jatuh tempo ${formatDateId(b.nextDueDate)} (${when}).`,
  ];
  if (b.intervalMonths > 1) lines.push(`Dibagi ke ${b.intervalMonths} periode di laporan.`);
  return {
    text: lines.join('\n'),
    buttons: [[
      { text: b.payWalletName ? `Bayar sekarang dari ${b.payWalletName}` : 'Bayar sekarang', data: `bp:${b.id}` },
      { text: 'Ingatkan besok', data: `bz:${b.id}` },
    ]],
  };
}

@Injectable()
export class BillsHandler {
  private readonly logger = new Logger(BillsHandler.name);

  constructor(
    private bills: BillsService,
    private transactions: TransactionsService,
  ) {}

  /** /tagihan: jatuh tempo terdekat + cadangan. */
  async list(user: BotUser): Promise<BotReply[]> {
    const o = await this.bills.overview(user.userId);
    if (o.bills.length === 0) return [send('Belum ada tagihan berkala. Tambahkan lewat web (menu Tagihan).')];
    const lines = ['🧾 Tagihan berkala'];
    for (const b of o.bills.slice(0, MAX_LIST)) {
      lines.push(`• ${b.name} ${rp(b.amount)}${b.intervalMonths > 1 ? ` /${b.intervalMonths} bln` : ''} — ${dueText(b)}`);
    }
    if (o.bills.length > MAX_LIST) lines.push(`… +${o.bills.length - MAX_LIST} lainnya`);
    lines.push('');
    lines.push(`Cadangan seharusnya: ${rp(o.totalReserve)} (sisihkan ${rp(o.totalPerPeriod)}/periode)`);
    if (o.defaultWallet && o.freeMoney !== null) lines.push(`Uang bebas di ${o.defaultWallet.name}: ${rp(o.freeMoney)}`);
    return [send(lines.join('\n'))];
  }

  /** Callback: bp:<billId> bayar (→ DRAFT) | bz:<billId> ingatkan besok. */
  async callback(user: BotUser, data: string): Promise<BotReply[]> {
    const [action, id] = data.split(':');
    if (!id) return [edit('Tombol ini sudah tidak berlaku.')];
    try {
      if (action === 'bz') {
        await this.bills.snooze(user.userId, id);
        return [edit('⏰ Oke, aku ingatkan lagi besok pagi.')];
      }
      const result = await this.bills.pay(user.userId, id, {}, 'TELEGRAM');
      const tx = await this.transactions.get(user.userId, result.transactionId);
      return [
        edit(`✅ ${result.message} Cek preview di bawah lalu tekan Simpan.`),
        sendMessage(renderDraft(tx, toDateString(getTodayInJakarta()), tx.spreadPeriods > 1 ? [`📆 Dibagi ke ${tx.spreadPeriods} periode di laporan`] : [])),
      ];
    } catch (error) {
      if (error instanceof NotFoundException) return [edit('Tagihan sudah tidak ada.')];
      this.logger.warn(`Callback tagihan gagal: ${getErrorText(error)}`);
      return [edit(`⚠️ ${getErrorText(error)}`)];
    }
  }
}
