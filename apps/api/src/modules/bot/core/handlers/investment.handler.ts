import { Injectable, Logger } from '@nestjs/common';
import { formatMoneyId, parseNominal } from 'shared';
import { WalletsService } from '../../../wallets/wallets.service';
import { getErrorText } from '../util';
import { BotReply, BotUser, edit, send } from '../types';

/** "update ipot 8,7jt" / "nilai reku 4,6jt" / "valuasi peluang 3jt" */
const VALUATION_TEXT = /^(update|nilai|valuasi|perbarui)\s+(.+?)\s+(\S+)$/i;

const signed = (v: string | bigint) => {
  const n = typeof v === 'bigint' ? v : BigInt(v);
  return `${n > 0n ? '+' : ''}${formatMoneyId(n)}`;
};
const pct = (v: number | null) => (v === null ? '' : ` (${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%)`);
const trend = (v: string) => (BigInt(v) > 0n ? '🟢' : BigInt(v) < 0n ? '🔴' : '⚪');

/** Callback: iv:<walletId>:<nilai>  → simpan nilai; ix → batal. Stateless: selisih dihitung ulang saat Simpan. */
@Injectable()
export class InvestmentHandler {
  private readonly logger = new Logger(InvestmentHandler.name);

  constructor(private wallets: WalletsService) {}

  /** /investasi */
  async report(user: BotUser): Promise<BotReply[]> {
    const s = await this.wallets.investmentSummary(user.userId);
    if (s.wallets.length === 0) {
      return [send('Belum ada dompet bertipe Investasi. Ubah tipe dompet lewat web (Dompet → Ubah).')];
    }
    const lines = ['📈 Investasi'];
    for (const w of s.wallets) {
      lines.push(`${trend(w.unrealized)} ${w.name}: ${formatMoneyId(w.value)}`);
      lines.push(`   Modal ${formatMoneyId(w.capital)} · ${signed(w.unrealized)}${pct(w.unrealizedPct)}`);
    }
    lines.push('');
    lines.push(`Total nilai: ${formatMoneyId(s.totalValue)}`);
    lines.push(`Total modal: ${formatMoneyId(s.totalCapital)}`);
    lines.push(`${trend(s.totalUnrealized)} Untung/rugi: ${signed(s.totalUnrealized)}${pct(s.totalUnrealizedPct)}`);
    lines.push('', 'Perbarui nilai: "update ipot 8,7jt"');
    return [send(lines.join('\n'))];
  }

  /**
   * Mengenali "update <dompet investasi> <nominal>". Mengembalikan null bila bukan perintah penyesuaian
   * (teks diteruskan ke alur transaksi biasa).
   */
  async tryValuation(user: BotUser, text: string): Promise<BotReply[] | null> {
    const m = VALUATION_TEXT.exec(text.trim());
    if (!m) return null;
    let value: bigint;
    try {
      value = parseNominal(m[3]);
    } catch {
      return null;
    }
    const needle = m[2].trim().toLowerCase();
    const list = (await this.wallets.list(user.userId, false)).filter((w) => w.type === 'INVESTMENT');
    const found = list.find((w) => w.name.toLowerCase() === needle) ?? list.find((w) => w.name.toLowerCase().includes(needle));
    if (!found) {
      return list.length === 0 ? null : [send(`Dompet investasi "${m[2]}" tidak ditemukan. Pilihan: ${list.map((w) => w.name).join(', ')}.`)];
    }
    const delta = value - BigInt(found.balance);
    const text2 = [
      `📈 Perbarui nilai ${found.name}`,
      `Sekarang: ${formatMoneyId(found.balance)}`,
      `Baru: ${formatMoneyId(value)}`,
      delta === 0n ? 'Tidak ada perubahan.' : `Selisih: ${signed(delta)} (penyesuaian nilai, bukan pemasukan/pengeluaran)`,
    ].join('\n');
    if (delta === 0n) return [send(text2)];
    return [send(text2, [[{ text: '✅ Simpan', data: `iv:${found.id}:${value}` }, { text: '❌ Batal', data: 'ix' }]])];
  }

  async callback(user: BotUser, data: string): Promise<BotReply[]> {
    if (data === 'ix') return [edit('Dibatalkan.')];
    const [, walletId, raw] = data.split(':');
    if (!walletId || !raw || !/^\d+$/.test(raw)) return [edit('Tombol ini sudah tidak berlaku.')];
    try {
      const res = await this.wallets.setValuation(user.userId, walletId, { value: BigInt(raw) });
      if (!res.adjustment) return [edit(`✅ Nilai ${res.wallet.name} sudah ${formatMoneyId(res.wallet.balance)}.`)];
      const inv = res.wallet.investment;
      const extra = inv ? `\nUntung/rugi: ${signed(inv.unrealized)}${pct(inv.unrealizedPct)}` : '';
      return [edit(`✅ Nilai ${res.wallet.name} diperbarui: ${formatMoneyId(res.wallet.balance)} (${signed(res.adjustment.amount)})${extra}`)];
    } catch (error) {
      this.logger.warn(`Perbarui nilai gagal: ${getErrorText(error)}`);
      return [edit(`⚠️ ${getErrorText(error)}`)];
    }
  }
}
