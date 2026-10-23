import { Injectable } from '@nestjs/common';
import { getPeriodRange, periodLabel, shiftMonth, toDateString } from 'shared';
import type { PeriodInfo } from 'shared';
import { PeriodsService } from '../periods/periods.service';
import { percentChange, percentOf } from '../../common/percent';
import { WalletsService } from '../wallets/wallets.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardByCategoryQuery, DashboardSummaryQuery, DashboardTrendQuery } from './dto/dashboard.dto';

export interface MonthTotals {
  totalIncome: string;
  totalExpense: string;
  net: string;
}

/** Info periode untuk respons: key = bulan tempat periode berakhir, tanggal kalender YYYY-MM-DD. */
const periodInfo = (key: string, startDay: number): PeriodInfo => {
  const { start, endExclusive } = getPeriodRange(key, startDay);
  return { key, label: periodLabel(key, startDay), start: toDateString(start), end: toDateString(new Date(endExclusive.getTime() - 86_400_000)) };
};

export interface SummaryResponse extends MonthTotals {
  /** Kunci periode (YYYY-MM). Bernama "month" demi kompatibilitas API. */
  month: string;
  previousMonth: string;
  period: PeriodInfo;
  previousPeriod: PeriodInfo;
  previous: MonthTotals;
  /** Persentase perubahan vs bulan sebelumnya (1 desimal); null jika bulan sebelumnya 0. */
  change: { income: number | null; expense: number | null; net: number | null };
  totalBalance: string;
}

export interface ByCategoryItem {
  categoryId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  percent: number;
  count: number;
}

export interface ByCategoryResponse {
  month: string;
  period: PeriodInfo;
  type: 'INCOME' | 'EXPENSE';
  total: string;
  items: ByCategoryItem[];
}

export interface PeriodReport {
  totalIncome: string;
  totalExpense: string;
  net: string;
  topExpenseCategories: Array<{ name: string; icon: string | null; total: string; percent: number }>;
}

export interface TrendItem {
  month: string;
  label: string;
  income: string;
  expense: string;
  net: string;
}

export { percentOf, percentChange };

@Injectable()
export class DashboardService {
  constructor(
    private repository: DashboardRepository,
    private wallets: WalletsService,
    private periods: PeriodsService,
  ) {}

  async summary(userId: string, query: DashboardSummaryQuery): Promise<SummaryResponse> {
    const { key: month, startDay } = await this.periods.resolve(userId, query.month);
    const previousMonth = shiftMonth(month, -1);
    const cur = getPeriodRange(month, startDay);
    const prev = getPeriodRange(previousMonth, startDay);

    const [current, previous, activeWallets] = await Promise.all([
      this.repository.sumByType(userId, cur.start, cur.endExclusive),
      this.repository.sumByType(userId, prev.start, prev.endExclusive),
      this.wallets.list(userId, false),
    ]);

    const curNet = current.income - current.expense;
    const prevNet = previous.income - previous.expense;
    const totalBalance = activeWallets.reduce((acc, w) => acc + BigInt(w.balance), 0n);

    return {
      month,
      previousMonth,
      period: periodInfo(month, startDay),
      previousPeriod: periodInfo(previousMonth, startDay),
      totalIncome: current.income.toString(),
      totalExpense: current.expense.toString(),
      net: curNet.toString(),
      previous: {
        totalIncome: previous.income.toString(),
        totalExpense: previous.expense.toString(),
        net: prevNet.toString(),
      },
      change: {
        income: percentChange(current.income, previous.income),
        expense: percentChange(current.expense, previous.expense),
        net: percentChange(curNet, prevNet),
      },
      totalBalance: totalBalance.toString(),
    };
  }

  async byCategory(userId: string, query: DashboardByCategoryQuery): Promise<ByCategoryResponse> {
    const { key: month, startDay } = await this.periods.resolve(userId, query.month);
    const { start, endExclusive } = getPeriodRange(month, startDay);
    const totals = await this.repository.totalsByCategory(userId, query.type, start, endExclusive);
    const infos = await this.repository.findCategories(
      totals.map((t) => t.categoryId).filter((id): id is string => id !== null),
    );
    const byId = new Map(infos.map((c) => [c.id, c]));
    const grand = totals.reduce((acc, t) => acc + t.total, 0n);

    const items = totals
      .map((t): ByCategoryItem => {
        const info = t.categoryId ? byId.get(t.categoryId) : undefined;
        return {
          categoryId: t.categoryId,
          name: info?.name ?? 'Tanpa kategori',
          color: info?.color ?? null,
          icon: info?.icon ?? null,
          total: t.total.toString(),
          percent: percentOf(t.total, grand),
          count: t.count,
        };
      })
      .sort((a, b) => {
        const diff = BigInt(b.total) - BigInt(a.total);
        return diff > 0n ? 1 : diff < 0n ? -1 : a.name.localeCompare(b.name);
      });

    return { month, period: periodInfo(month, startDay), type: query.type, total: grand.toString(), items };
  }

  /** Ringkasan rentang tanggal arbitrer (hari ini, bulan ini, ...) + 3 kategori pengeluaran terbesar. */
  async period(userId: string, start: Date, endExclusive: Date, topN = 3): Promise<PeriodReport> {
    const [sums, totals] = await Promise.all([
      this.repository.sumByType(userId, start, endExclusive),
      this.repository.totalsByCategory(userId, 'EXPENSE', start, endExclusive),
    ]);
    const sorted = [...totals].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0)).slice(0, topN);
    const infos = await this.repository.findCategories(sorted.map((t) => t.categoryId).filter((id): id is string => id !== null));
    const byId = new Map(infos.map((c) => [c.id, c]));
    return {
      totalIncome: sums.income.toString(),
      totalExpense: sums.expense.toString(),
      net: (sums.income - sums.expense).toString(),
      topExpenseCategories: sorted.map((t) => {
        const info = t.categoryId ? byId.get(t.categoryId) : undefined;
        return {
          name: info?.name ?? 'Tanpa kategori',
          icon: info?.icon ?? null,
          total: t.total.toString(),
          percent: percentOf(t.total, sums.expense),
        };
      }),
    };
  }

  /** Tambahan untuk insight: 3 pengeluaran terbesar dan hari paling boros dalam satu bulan. */
  async insightExtras(userId: string, month: string) {
    const { startDay } = await this.periods.resolve(userId, month);
    const { start, endExclusive } = getPeriodRange(month, startDay);
    const [largest, peak] = await Promise.all([
      this.repository.largestExpenses(userId, start, endExclusive, 3),
      this.repository.peakSpendingDay(userId, start, endExclusive),
    ]);
    return {
      largestExpenses: largest.map((l) => ({
        date: l.date.toISOString().slice(0, 10),
        label: l.merchant ?? l.categoryName ?? 'Tanpa keterangan',
        amount: l.amount.toString(),
      })),
      peakDay: peak ? { date: peak.day, total: peak.total.toString() } : null,
    };
  }

  async trend(userId: string, query: DashboardTrendQuery): Promise<{ months: TrendItem[] }> {
    const { key: last, startDay } = await this.periods.resolve(userId);
    const first = shiftMonth(last, -(query.months - 1));
    const rows = await this.repository.monthlyTotals(
      userId,
      getPeriodRange(first, startDay).start,
      getPeriodRange(last, startDay).endExclusive,
      startDay,
    );

    const months: TrendItem[] = [];
    for (let i = 0; i < query.months; i++) {
      const month = shiftMonth(first, i);
      const sum = (type: 'INCOME' | 'EXPENSE') =>
        rows.find((r) => r.month === month && r.type === type)?.total ?? 0n;
      const income = sum('INCOME');
      const expense = sum('EXPENSE');
      months.push({ month, label: periodLabel(month, startDay), income: income.toString(), expense: expense.toString(), net: (income - expense).toString() });
    }
    return { months };
  }
}
