import { formatMoneyId } from 'shared';
import type { InsightNarrativeData, InsightStats } from './insight.types';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** "2026-10" → "Oktober 2026" */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

const rp = (v: string | bigint) => formatMoneyId(v);
const pct = (v: number) => `${Math.abs(v).toLocaleString('id-ID')}%`;

/** Semua nominal Rupiah dalam statistik (dasar validasi angka narasi). */
export function collectStatNumbers(stats: InsightStats): bigint[] {
  const raw: Array<string | null | undefined> = [
    stats.totalIncome,
    stats.totalExpense,
    stats.net,
    stats.previousMonthExpense,
    stats.avg3mExpense,
    stats.peakDay?.total,
    ...stats.topCategories.map((c) => c.total),
    ...stats.anomalies.flatMap((a) => [a.total, a.avg3m]),
    ...stats.largestTransactions.map((t) => t.amount),
    ...stats.allocationFlags.flatMap((a) => [a.planned, a.realized]),
    ...stats.savings.flatMap((g) => [g.collected, g.target, g.remaining]),
  ];
  // Nilai mutlak: narasi menulis "selisih -Rp500.000" sebagai Rp500.000.
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => BigInt(v))
    .map((v) => (v < 0n ? -v : v));
}

/** Tampilan statistik untuk LLM: nominal sudah diformat "Rp1.287.500" supaya disalin apa adanya. */
export function promptView(stats: InsightStats): Record<string, unknown> {
  return {
    period: periodLabel(stats.period),
    provisional: stats.provisional,
    asOf: stats.asOf,
    totalIncome: rp(stats.totalIncome),
    totalExpense: rp(stats.totalExpense),
    net: rp(stats.net),
    previousMonthExpense: rp(stats.previousMonthExpense),
    changeVsPreviousMonthPercent: stats.changeVsPreviousPercent,
    avg3mExpense: stats.avg3mExpense ? rp(stats.avg3mExpense) : null,
    avgBasisMonths: stats.avgBasisMonths,
    expenseVsAvgPercent: stats.expenseVsAvgPercent,
    topCategories: stats.topCategories.map((c) => ({ name: c.name, total: rp(c.total), percent: c.percent, transactions: c.count })),
    anomalies: stats.anomalies.map((a) => ({ name: a.name, total: rp(a.total), avg3m: rp(a.avg3m), increasePercent: a.increasePercent })),
    largestTransactions: stats.largestTransactions.map((t) => ({ date: t.date, label: t.label, amount: rp(t.amount) })),
    allocationFlags: stats.allocationFlags.map((a) => ({ name: a.name, status: a.status, planned: rp(a.planned), realized: rp(a.realized) })),
    savings: stats.savings.map((g) => ({
      name: g.name,
      percent: g.percent,
      collected: rp(g.collected),
      target: g.target ? rp(g.target) : null,
      remaining: g.remaining ? rp(g.remaining) : null,
      estimatedMonths: g.estimatedMonths,
    })),
    peakDay: stats.peakDay ? { date: stats.peakDay.date, total: rp(stats.peakDay.total) } : null,
  };
}

/**
 * Narasi cadangan tanpa LLM, dibangun dari statistik. Semua nominal berasal persis dari statistik,
 * jadi selalu lolos validasi angka.
 */
export function templateNarrative(stats: InsightStats): InsightNarrativeData {
  const label = periodLabel(stats.period);
  const partial = stats.provisional && stats.asOf ? ` (sementara, data sampai ${stats.asOf})` : '';

  let summary = `Pada ${label}${partial}, pemasukanmu ${rp(stats.totalIncome)} dan pengeluaranmu ${rp(stats.totalExpense)}, sehingga selisihnya ${rp(stats.net)}.`;
  if (stats.avg3mExpense !== null && stats.expenseVsAvgPercent !== null) {
    summary += ` Pengeluaran ${stats.expenseVsAvgPercent > 0 ? 'naik' : 'turun'} ${pct(stats.expenseVsAvgPercent)} dibanding rata-rata ${stats.avgBasisMonths} bulan sebelumnya (${rp(stats.avg3mExpense)}).`;
  }

  const findings: string[] = [];
  const top = stats.topCategories[0];
  if (top) findings.push(`Kategori terbesar adalah ${top.name}: ${rp(top.total)} (${top.percent.toLocaleString('id-ID')}% dari pengeluaran).`);
  for (const a of stats.anomalies.slice(0, 1)) {
    findings.push(`${a.name} naik ${pct(a.increasePercent)} dari rata-rata ${rp(a.avg3m)} menjadi ${rp(a.total)}.`);
  }
  const big = stats.largestTransactions[0];
  if (big) findings.push(`Pengeluaran tunggal terbesar: ${big.label} sebesar ${rp(big.amount)} pada ${big.date}.`);
  if (stats.peakDay) findings.push(`Hari dengan pengeluaran tertinggi adalah ${stats.peakDay.date}: ${rp(stats.peakDay.total)}.`);
  for (const f of stats.allocationFlags.slice(0, 1)) {
    findings.push(`Pos ${f.name} berstatus ${f.status === 'LEBIH' ? 'melebihi rencana' : 'hampir habis'}: terpakai ${rp(f.realized)} dari ${rp(f.planned)}.`);
  }
  const fillerFindings = ['Belum ada pola pengeluaran lain yang menonjol.', 'Data bulan ini masih sedikit untuk menarik kesimpulan lebih jauh.', 'Tidak ada anomali pengeluaran yang terdeteksi.'];
  for (const filler of fillerFindings) if (findings.length < 3) findings.push(filler);

  const suggestions: string[] = [];
  const anomaly = stats.anomalies[0];
  if (anomaly) suggestions.push(`Tinjau pengeluaran ${anomaly.name} dan tetapkan batas mingguan agar kembali mendekati rata-rata ${rp(anomaly.avg3m)}.`);
  const flag = stats.allocationFlags[0];
  if (flag) suggestions.push(`Tahan pengeluaran pos ${flag.name} sampai akhir bulan agar tidak melewati rencana ${rp(flag.planned)}.`);
  const goal = stats.savings.find((g) => g.remaining !== null && g.remaining !== '0');
  if (goal) suggestions.push(`Sisihkan setoran rutin ke ${goal.name}; masih kurang ${rp(goal.remaining as string)} dari target ${rp(goal.target as string)}.`);
  if (top) suggestions.push(`Cek ulang transaksi di kategori ${top.name} dan cari satu pos yang bisa dihemat minggu ini.`);
  const fillerSuggestions = ['Catat setiap transaksi di hari yang sama agar data tetap akurat.', 'Tinjau anggaran bulanan setiap akhir pekan.', 'Sisihkan sebagian pemasukan ke tabungan sebelum membelanjakan.'];
  for (const filler of fillerSuggestions) if (suggestions.length < 3) suggestions.push(filler);

  return { summary, findings: findings.slice(0, 3), suggestions: suggestions.slice(0, 3) };
}
