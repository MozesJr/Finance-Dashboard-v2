import { Injectable } from '@nestjs/common';
import { getCurrentMonthJakarta, getMonthRange, shiftMonth } from 'shared';
import { percentChange, percentOf } from '../../common/percent';
import { WalletsService } from '../wallets/wallets.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardByCategoryQuery, DashboardSummaryQuery, DashboardTrendQuery } from './dto/dashboard.dto';

export interface MonthTotals {
  totalIncome: string;
  totalExpense: string;
  net: string;
}

export interface SummaryResponse extends MonthTotals {
  month: string;
  previousMonth: string;
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
  type: 'INCOME' | 'EXPENSE';
  total: string;
  items: ByCategoryItem[];
}

export interface TrendItem {
  month: string;
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
  ) {}

  async summary(userId: string, query: DashboardSummaryQuery): Promise<SummaryResponse> {
    const month = query.month ?? getCurrentMonthJakarta();
    const previousMonth = shiftMonth(month, -1);
    const cur = getMonthRange(month);
    const prev = getMonthRange(previousMonth);

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
    const month = query.month ?? getCurrentMonthJakarta();
    const { start, endExclusive } = getMonthRange(month);
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

    return { month, type: query.type, total: grand.toString(), items };
  }

  async trend(userId: string, query: DashboardTrendQuery): Promise<{ months: TrendItem[] }> {
    const last = getCurrentMonthJakarta();
    const first = shiftMonth(last, -(query.months - 1));
    const rows = await this.repository.monthlyTotals(
      userId,
      getMonthRange(first).start,
      getMonthRange(last).endExclusive,
    );

    const months: TrendItem[] = [];
    for (let i = 0; i < query.months; i++) {
      const month = shiftMonth(first, i);
      const sum = (type: 'INCOME' | 'EXPENSE') =>
        rows.find((r) => r.month === month && r.type === type)?.total ?? 0n;
      const income = sum('INCOME');
      const expense = sum('EXPENSE');
      months.push({ month, income: income.toString(), expense: expense.toString(), net: (income - expense).toString() });
    }
    return { months };
  }
}
