/** Statistik bulanan yang dihitung di kode. Nominal Rupiah berupa string BigInt. */
export interface InsightStats {
  period: string; // YYYY-MM
  provisional: boolean;
  /** Tanggal data terakhir (hari ini) bila provisional. */
  asOf: string | null;
  totalIncome: string;
  totalExpense: string;
  net: string;
  previousMonthExpense: string;
  changeVsPreviousPercent: number | null;
  /** Rata-rata pengeluaran 3 bulan penuh sebelumnya (hanya bulan yang punya data). */
  avg3mExpense: string | null;
  avgBasisMonths: number;
  expenseVsAvgPercent: number | null;
  topCategories: Array<{ name: string; total: string; percent: number; count: number }>;
  /** Kategori yang naik > 30% dibanding rata-rata 3 bulan sebelumnya. */
  anomalies: Array<{ name: string; total: string; avg3m: string; increasePercent: number }>;
  largestTransactions: Array<{ date: string; label: string; amount: string }>;
  allocationFlags: Array<{ name: string; status: string; planned: string; realized: string }>;
  savings: Array<{ name: string; percent: number | null; collected: string; target: string | null; remaining: string | null; estimatedMonths: number | null }>;
  peakDay: { date: string; total: string } | null;
}

export interface InsightNarrativeData {
  summary: string;
  findings: string[];
  suggestions: string[];
}

export interface InsightContent {
  stats: InsightStats;
  narrative: InsightNarrativeData;
  /** LLM = narasi AI; TEMPLATE = ringkasan otomatis tanpa LLM. */
  source: 'LLM' | 'TEMPLATE';
}

export interface InsightResponse extends InsightContent {
  period: string;
  provisional: boolean;
  generatedAt: Date;
}
