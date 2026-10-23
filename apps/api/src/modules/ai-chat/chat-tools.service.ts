import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DateStringSchema, formatMoneyId, MonthStringSchema } from 'shared';
import { AllocationService } from '../allocation/allocation.service';
import type { ToolDefinition } from '../ai/llm-client.service';
import { BillsService } from '../bills/bills.service';
import { CategoriesService } from '../categories/categories.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { SavingsService } from '../savings/savings.service';
import { TransactionsService } from '../transactions/transactions.service';
import { WalletsService } from '../wallets/wallets.service';

export const MAX_SEARCH_ROWS = 20;
const MAX_RESULT_CHARS = 6000;

const rp = (v: string | bigint) => formatMoneyId(v);

const SummaryArgs = z.object({ month: MonthStringSchema.optional() }).strict();
const ByCategoryArgs = z.object({ month: MonthStringSchema.optional(), type: z.enum(['EXPENSE', 'INCOME']).optional() }).strict();
const TrendArgs = z.object({ months: z.number().int().min(1).max(12).optional() }).strict();
const SearchArgs = z
  .object({
    dateFrom: DateStringSchema.optional(),
    dateTo: DateStringSchema.optional(),
    type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']).optional(),
    categoryName: z.string().trim().min(1).max(60).optional(),
    walletName: z.string().trim().min(1).max(60).optional(),
    q: z.string().trim().min(1).max(60).optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_ROWS).optional(),
  })
  .strict();
const NoArgs = z.object({}).strict();
const AllocationArgs = z.object({ month: MonthStringSchema.optional() }).strict();

const monthProp = {
  type: 'string',
  description: 'Kunci periode keuangan format YYYY-MM (bulan tempat periode berakhir). Kosongkan untuk periode berjalan.',
};

/** Definisi tool untuk model. userId TIDAK ada di parameter mana pun: selalu disuntik server. */
export const CHAT_TOOLS: ToolDefinition[] = [
  {
    name: 'get_summary',
    description: 'Ringkasan satu periode keuangan (rentang gajian user): total pemasukan, pengeluaran, selisih, perubahan vs bulan sebelumnya, dan total saldo.',
    parameters: { type: 'object', properties: { month: monthProp } },
  },
  {
    name: 'get_spending_by_category',
    description: 'Rincian total per kategori untuk satu periode keuangan (terbesar dulu), beserta persentase.',
    parameters: { type: 'object', properties: { month: monthProp, type: { type: 'string', enum: ['EXPENSE', 'INCOME'], description: 'Default EXPENSE.' } } },
  },
  {
    name: 'get_trend',
    description: 'Tren pemasukan, pengeluaran, dan selisih per periode keuangan untuk N periode terakhir.',
    parameters: { type: 'object', properties: { months: { type: 'integer', description: '1–12, default 6.' } } },
  },
  {
    name: 'search_transactions',
    description: `Cari transaksi (maks. ${MAX_SEARCH_ROWS} baris, terbaru dulu). Filter opsional; categoryName/walletName berupa nama.`,
    parameters: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', description: 'YYYY-MM-DD' },
        dateTo: { type: 'string', description: 'YYYY-MM-DD' },
        type: { type: 'string', enum: ['EXPENSE', 'INCOME', 'TRANSFER'] },
        categoryName: { type: 'string' },
        walletName: { type: 'string' },
        q: { type: 'string', description: 'Kata kunci di toko/catatan.' },
        limit: { type: 'integer', description: `1–${MAX_SEARCH_ROWS}, default 10.` },
      },
    },
  },
  { name: 'get_wallet_balances', description: 'Saldo setiap dompet aktif dan totalnya.', parameters: { type: 'object', properties: {} } },
  {
    name: 'get_bills',
    description: 'Tagihan berkala aktif: nominal, interval, jatuh tempo, cadangan seharusnya, dan "uang bebas" (saldo dompet default dikurangi cadangan).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_investments',
    description: 'Nilai terkini, modal, dan untung/rugi belum direalisasi per dompet investasi, beserta total. Penyesuaian nilai pasar BUKAN pemasukan/pengeluaran.',
    parameters: { type: 'object', properties: {} },
  },
  { name: 'get_savings_status', description: 'Progres goal tabungan: terkumpul, target, persen, estimasi bulan.', parameters: { type: 'object', properties: {} } },
  {
    name: 'get_allocation',
    description: 'Status alokasi gaji per pos untuk satu periode: rencana, realisasi, sisa, status.',
    parameters: { type: 'object', properties: { month: monthProp } },
  },
];

/** Menjalankan tool dengan memanggil service yang sudah ada. Tidak pernah menyentuh Prisma/SQL. */
@Injectable()
export class ChatToolsService {
  constructor(
    private dashboard: DashboardService,
    private transactions: TransactionsService,
    private wallets: WalletsService,
    private savings: SavingsService,
    private allocation: AllocationService,
    private categories: CategoriesService,
    private bills: BillsService,
  ) {}

  /** Mengembalikan string JSON (maks. ~6000 karakter). Error dikembalikan sebagai {"error": "..."} agar model bisa menjelaskan. */
  async execute(userId: string, name: string, rawArguments: string): Promise<string> {
    let args: unknown;
    try {
      args = rawArguments.trim() === '' ? {} : JSON.parse(rawArguments);
    } catch {
      return this.out({ error: 'Argumen tool bukan JSON yang valid.' });
    }
    try {
      switch (name) {
        case 'get_summary':
          return this.out(await this.summary(userId, SummaryArgs.parse(args)));
        case 'get_spending_by_category':
          return this.out(await this.byCategory(userId, ByCategoryArgs.parse(args)));
        case 'get_trend':
          return this.out(await this.trend(userId, TrendArgs.parse(args)));
        case 'search_transactions':
          return this.out(await this.search(userId, SearchArgs.parse(args)));
        case 'get_wallet_balances':
          NoArgs.parse(args);
          return this.out(await this.walletBalances(userId));
        case 'get_bills':
          NoArgs.parse(args);
          return this.out(await this.billsOverview(userId));
        case 'get_investments':
          NoArgs.parse(args);
          return this.out(await this.investments(userId));
        case 'get_savings_status':
          NoArgs.parse(args);
          return this.out(await this.savingsStatus(userId));
        case 'get_allocation':
          return this.out(await this.allocationStatus(userId, AllocationArgs.parse(args)));
        default:
          return this.out({ error: `Tool "${name}" tidak dikenal.` });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return this.out({ error: `Argumen tidak valid: ${error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ')}` });
      }
      return this.out({ error: error instanceof Error && error.message ? error.message : 'Data tidak bisa diambil.' });
    }
  }

  private out(value: unknown): string {
    const text = JSON.stringify(value);
    return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…[dipotong]` : text;
  }

  private async summary(userId: string, a: z.infer<typeof SummaryArgs>) {
    const s = await this.dashboard.summary(userId, { month: a.month });
    return {
      period: s.month,
      periodLabel: s.period.label,
      totalIncome: s.totalIncome,
      totalIncomeFormatted: rp(s.totalIncome),
      totalExpense: s.totalExpense,
      totalExpenseFormatted: rp(s.totalExpense),
      net: s.net,
      netFormatted: rp(s.net),
      previousPeriod: s.previousMonth,
      previousExpenseFormatted: rp(s.previous.totalExpense),
      previousIncomeFormatted: rp(s.previous.totalIncome),
      changePercentVsPrevious: s.change,
      totalBalanceFormatted: rp(s.totalBalance),
    };
  }

  private async byCategory(userId: string, a: z.infer<typeof ByCategoryArgs>) {
    const r = await this.dashboard.byCategory(userId, { month: a.month, type: a.type ?? 'EXPENSE' });
    return {
      period: r.month,
      periodLabel: r.period.label,
      type: r.type,
      totalFormatted: rp(r.total),
      categories: r.items.slice(0, 10).map((i) => ({ name: i.name, totalFormatted: rp(i.total), percent: i.percent, transactionCount: i.count })),
    };
  }

  private async trend(userId: string, a: z.infer<typeof TrendArgs>) {
    const r = await this.dashboard.trend(userId, { months: a.months ?? 6 });
    return {
      months: r.months.map((m) => ({ period: m.month, periodLabel: m.label, incomeFormatted: rp(m.income), expenseFormatted: rp(m.expense), netFormatted: rp(m.net) })),
    };
  }

  private async billsOverview(userId: string) {
    const o = await this.bills.overview(userId);
    return {
      bills: o.bills.slice(0, 10).map((b) => ({
        name: b.name,
        amountFormatted: rp(b.amount),
        everyMonths: b.intervalMonths,
        nextDueDate: b.nextDueDate,
        daysUntilDue: b.daysUntilDue,
        reservePerPeriodFormatted: rp(b.reservePerPeriod),
        accumulatedReserveFormatted: rp(b.accumulated),
      })),
      totalReserveFormatted: rp(o.totalReserve),
      totalPerPeriodFormatted: rp(o.totalPerPeriod),
      defaultWallet: o.defaultWallet?.name ?? null,
      freeMoneyFormatted: o.freeMoney === null ? null : rp(o.freeMoney),
    };
  }

  private async investments(userId: string) {
    const s = await this.wallets.investmentSummary(userId);
    const pct = (v: number | null) => (v === null ? null : `${v.toFixed(2).replace('.', ',')}%`);
    return {
      wallets: s.wallets.map((w) => ({
        name: w.name,
        valueFormatted: rp(w.value),
        capitalFormatted: rp(w.capital),
        unrealizedFormatted: rp(w.unrealized),
        unrealizedPercent: pct(w.unrealizedPct),
        lastUpdated: w.lastAdjustedAt,
      })),
      totalValueFormatted: rp(s.totalValue),
      totalCapitalFormatted: rp(s.totalCapital),
      totalUnrealizedFormatted: rp(s.totalUnrealized),
      totalUnrealizedPercent: pct(s.totalUnrealizedPct),
    };
  }

  private async search(userId: string, a: z.infer<typeof SearchArgs>) {
    const limit = Math.min(a.limit ?? 10, MAX_SEARCH_ROWS);
    let categoryId: string | undefined;
    let walletId: string | undefined;
    if (a.categoryName) {
      const needle = a.categoryName.toLowerCase();
      const found = (await this.categories.list(userId)).find((c) => c.name.toLowerCase() === needle) ?? (await this.categories.list(userId)).find((c) => c.name.toLowerCase().includes(needle));
      if (!found) return { error: `Kategori "${a.categoryName}" tidak ditemukan.` };
      categoryId = found.id;
    }
    if (a.walletName) {
      const needle = a.walletName.toLowerCase();
      const found = (await this.wallets.list(userId, true)).find((w) => w.name.toLowerCase().includes(needle));
      if (!found) return { error: `Dompet "${a.walletName}" tidak ditemukan.` };
      walletId = found.id;
    }
    const page = await this.transactions.list(userId, {
      dateFrom: a.dateFrom,
      dateTo: a.dateTo,
      type: a.type,
      categoryId,
      walletId,
      q: a.q,
      limit,
    });
    // Penyesuaian nilai pasar bukan pemasukan/pengeluaran: tidak ikut hasil pencarian.
    const items = page.items.filter((t) => t.type !== 'ADJUSTMENT');
    return {
      count: items.length,
      hasMore: page.nextCursor !== null,
      transactions: items.map((t) => ({
        date: t.date,
        type: t.type,
        amountFormatted: rp(t.amount),
        category: t.category?.name ?? null,
        wallet: t.wallet.name,
        toWallet: t.toWallet?.name ?? null,
        merchant: t.merchant,
        note: t.note,
      })),
    };
  }

  private async walletBalances(userId: string) {
    const list = await this.wallets.list(userId, false);
    const total = list.reduce((acc, w) => acc + BigInt(w.balance), 0n);
    return { wallets: list.map((w) => ({ name: w.name, type: w.type, balanceFormatted: rp(w.balance) })), totalFormatted: rp(total) };
  }

  private async savingsStatus(userId: string) {
    const goals = await this.savings.list(userId, false);
    return {
      goals: goals.map((g) => ({
        name: g.name,
        type: g.type,
        collectedFormatted: rp(g.collected),
        targetFormatted: g.target === null ? null : rp(g.target),
        percent: g.percent,
        remainingFormatted: g.remaining === null ? null : rp(g.remaining),
        estimatedMonths: g.estimatedMonths,
      })),
    };
  }

  private async allocationStatus(userId: string, a: z.infer<typeof AllocationArgs>) {
    try {
      const r = await this.allocation.report(userId, { month: a.month });
      return {
        period: r.month,
        periodLabel: r.period.label,
        phase: r.phase,
        monthlyIncomeFormatted: rp(r.monthlyIncome),
        items: r.items.map((i) => ({
          name: i.name,
          percent: i.percent,
          plannedFormatted: rp(i.planned),
          realizedFormatted: rp(i.realized),
          remainingFormatted: rp(i.remaining),
          status: i.status,
        })),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Alokasi tidak tersedia.' };
    }
  }
}
