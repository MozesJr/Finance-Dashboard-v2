import { Injectable, Logger } from '@nestjs/common';
import { getTodayInJakarta, shiftMonth, toDateString } from 'shared';
import { PeriodsService } from '../periods/periods.service';
import { AllocationService } from '../allocation/allocation.service';
import { percentChange } from '../../common/percent';
import { DashboardService } from '../dashboard/dashboard.service';
import { SavingsService } from '../savings/savings.service';
import type { InsightStats } from './insight.types';

const ANOMALY_THRESHOLD_PERCENT = 30;
const ANOMALY_MIN_TOTAL = 50_000n;

/** Semua angka statistik dihitung di sini (kode), LLM hanya menarasikan. */
@Injectable()
export class InsightStatsService {
  private readonly logger = new Logger(InsightStatsService.name);

  constructor(
    private dashboard: DashboardService,
    private allocation: AllocationService,
    private savings: SavingsService,
    private periods: PeriodsService,
  ) {}

  async build(userId: string, month: string): Promise<InsightStats> {
    const { key: current } = await this.periods.resolve(userId);
    const priorMonths = [1, 2, 3].map((n) => shiftMonth(month, -n));

    const [summary, byCategory, priorSummaries, priorCategories, extras] = await Promise.all([
      this.dashboard.summary(userId, { month }),
      this.dashboard.byCategory(userId, { month, type: 'EXPENSE' }),
      Promise.all(priorMonths.map((m) => this.dashboard.summary(userId, { month: m }))),
      Promise.all(priorMonths.map((m) => this.dashboard.byCategory(userId, { month: m, type: 'EXPENSE' }))),
      this.dashboard.insightExtras(userId, month),
    ]);

    // Rata-rata pengeluaran: hanya bulan yang punya data.
    const priorExpenses = priorSummaries.map((s) => BigInt(s.totalExpense)).filter((v) => v > 0n);
    const avgExpense = priorExpenses.length > 0 ? priorExpenses.reduce((a, b) => a + b, 0n) / BigInt(priorExpenses.length) : null;
    const expense = BigInt(summary.totalExpense);

    return {
      period: month,
      periodLabel: summary.period.label,
      provisional: month === current,
      asOf: month === current ? toDateString(getTodayInJakarta()) : null,
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      net: summary.net,
      previousMonthExpense: summary.previous.totalExpense,
      changeVsPreviousPercent: summary.change.expense,
      avg3mExpense: avgExpense?.toString() ?? null,
      avgBasisMonths: priorExpenses.length,
      expenseVsAvgPercent: avgExpense !== null ? percentChange(expense, avgExpense) : null,
      topCategories: byCategory.items.slice(0, 5).map((i) => ({ name: i.name, total: i.total, percent: i.percent, count: i.count })),
      anomalies: this.anomalies(byCategory.items, priorCategories.map((c) => c.items)),
      largestTransactions: extras.largestExpenses,
      allocationFlags: await this.allocationFlags(userId, month),
      savings: await this.savingsPace(userId),
      peakDay: extras.peakDay,
    };
  }

  /** Kategori bulan ini yang naik > 30% dari rata-rata 3 bulan sebelumnya (rata-rata atas bulan yang punya data kategori itu). */
  private anomalies(
    current: Array<{ name: string; total: string }>,
    prior: Array<Array<{ name: string; total: string }>>,
  ): InsightStats['anomalies'] {
    const out: InsightStats['anomalies'] = [];
    for (const item of current) {
      const total = BigInt(item.total);
      if (total < ANOMALY_MIN_TOTAL) continue;
      const history = prior.map((items) => items.find((i) => i.name === item.name)).filter((i): i is { name: string; total: string } => Boolean(i));
      if (history.length === 0) continue;
      const avg = history.reduce((acc, i) => acc + BigInt(i.total), 0n) / BigInt(history.length);
      if (avg === 0n) continue;
      const increase = percentChange(total, avg);
      if (increase !== null && increase > ANOMALY_THRESHOLD_PERCENT) {
        out.push({ name: item.name, total: item.total, avg3m: avg.toString(), increasePercent: increase });
      }
    }
    return out.sort((a, b) => b.increasePercent - a.increasePercent).slice(0, 3);
  }

  private async allocationFlags(userId: string, month: string): Promise<InsightStats['allocationFlags']> {
    try {
      const report = await this.allocation.report(userId, { month });
      return report.items
        .filter((i) => i.kind === 'EXPENSE' && (i.status === 'HAMPIR' || i.status === 'LEBIH'))
        .map((i) => ({ name: i.name, status: i.status, planned: i.planned, realized: i.realized }));
    } catch {
      return []; // belum ada rencana alokasi
    }
  }

  private async savingsPace(userId: string): Promise<InsightStats['savings']> {
    try {
      const goals = await this.savings.list(userId, false);
      return goals.map((g) => ({
        name: g.name,
        percent: g.percent,
        collected: g.collected,
        target: g.target,
        remaining: g.remaining,
        estimatedMonths: g.estimatedMonths,
      }));
    } catch (error) {
      this.logger.warn(`Statistik tabungan gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      return [];
    }
  }
}
