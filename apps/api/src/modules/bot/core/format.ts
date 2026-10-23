import { formatMoneyId } from 'shared';
import type { TransactionResponse } from '../../transactions/transactions.service';
import type { InlineButton, OutgoingMessage } from './types';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "2026-10-23" → "23 Okt 2026" */
export function formatDateId(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function dayDiff(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

export function relativeDateLabel(date: string, today: string): string {
  const diff = dayDiff(date, today);
  if (diff === 0) return ' (hari ini)';
  if (diff === 1) return ' (kemarin)';
  if (diff === 2) return ' (2 hari lalu)';
  return '';
}

export const TYPE_LABEL = { INCOME: 'Pemasukan', EXPENSE: 'Pengeluaran', TRANSFER: 'Transfer' } as const;
export const TYPE_EMOJI = { INCOME: '💰', EXPENSE: '💸', TRANSFER: '🔁' } as const;

type TxType = keyof typeof TYPE_LABEL;

const categoryLine = (tx: TransactionResponse) =>
  tx.category ? `${tx.category.icon ? `${tx.category.icon} ` : ''}${tx.category.name}` : '(belum dipilih)';

/** Pesan pratinjau draft + tombol aksi. */
export function renderDraft(tx: TransactionResponse, today: string): OutgoingMessage {
  const type = tx.type as TxType;
  const lines = [
    '📝 Draft transaksi',
    `${TYPE_EMOJI[type]} ${TYPE_LABEL[type]} · ${formatMoneyId(tx.amount)}`,
  ];
  if (type !== 'TRANSFER') lines.push(`🏷 ${categoryLine(tx)}`);
  lines.push(type === 'TRANSFER' ? `👛 ${tx.wallet.name} → ${tx.toWallet?.name ?? '?'}` : `👛 ${tx.wallet.name}`);
  lines.push(`📅 ${formatDateId(tx.date)}${relativeDateLabel(tx.date, today)}`);
  if (tx.merchant) lines.push(`🗒 ${tx.merchant}`);
  if (tx.aiConfidence !== null && tx.aiConfidence !== undefined) {
    lines.push(`🤖 ditebak AI (yakin ${Math.round(tx.aiConfidence * 100)}%) — cek dulu ya`);
  }
  lines.push('Tekan ✅ Simpan untuk mencatat.');

  const second: InlineButton[] = [];
  if (type !== 'TRANSFER') second.push({ text: '🏷 Kategori', data: `c:${tx.id}` });
  second.push({ text: '👛 Dompet', data: `w:${tx.id}` }, { text: '📅 Tanggal', data: `d:${tx.id}` });

  return {
    text: lines.join('\n'),
    buttons: [[{ text: '✅ Simpan', data: `s:${tx.id}` }, { text: '❌ Batal', data: `x:${tx.id}` }], second],
  };
}

/** Ringkasan satu baris untuk transaksi tersimpan / konfirmasi undo. */
export function summarizeTx(tx: TransactionResponse): string {
  const type = tx.type as TxType;
  const parts = [`${TYPE_LABEL[type]} ${formatMoneyId(tx.amount)}`];
  if (tx.category) parts.push(tx.category.name);
  parts.push(type === 'TRANSFER' ? `${tx.wallet.name} → ${tx.toWallet?.name ?? '?'}` : tx.wallet.name);
  parts.push(formatDateId(tx.date));
  if (tx.merchant) parts.push(`"${tx.merchant}"`);
  return parts.join(' · ');
}
