import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SavingsContribution } from '@prisma/client';
import { getCurrentMonthJakarta, getMonthRange, getTodayInJakarta, shiftMonth } from 'shared';
import { percentOf } from '../../common/percent';
import { WalletsService } from '../wallets/wallets.service';
import { ContributionStats, GoalWithWallet, GoalWriteData, MonthlyTotal, SavingsRepository } from './savings.repository';
import {
  CreateContributionInput,
  CreateGoalInput,
  UpdateContributionInput,
  UpdateGoalInput,
} from './dto/savings.dto';

export interface GoalResponse {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  targetMode: string;
  targetAmount: string | null;
  targetMonths: number | null;
  targetDate: string | null;
  walletId: string | null;
  wallet: { id: string; name: string } | null;
  isArchived: boolean;
  collected: string;
  /** Target efektif: targetAmount (MANUAL) atau targetMonths × rata-rata pengeluaran (MONTHS_OF_EXPENSE). */
  target: string | null;
  avgMonthlyExpense: string | null;
  basisMonths: number;
  targetNote: string | null;
  remaining: string | null;
  percent: number | null;
  estimatedMonths: number | null;
  createdAt: Date;
}

export interface ContributionResponse {
  id: string;
  goalId: string;
  type: string;
  amount: string;
  date: string;
  note: string | null;
  transactionId: string | null;
  createdAt: Date;
}

export interface AvgExpense {
  avg: bigint;
  basisMonths: number;
}

const ESTIMATE_WINDOW_MONTHS = 3;
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const monthIndex = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
};
const signed = (type: string, amount: bigint) => (type === 'DEPOSIT' ? amount : -amount);

/** Rata-rata pengeluaran bulanan dari bulan yang punya data (maks. 3 bulan penuh terakhir). */
export function averageExpense(totals: MonthlyTotal[]): AvgExpense | null {
  const withData = totals.filter((t) => t.total > 0n);
  if (withData.length === 0) return null;
  const sum = withData.reduce((acc, t) => acc + t.total, 0n);
  return { avg: sum / BigInt(withData.length), basisMonths: withData.length };
}

export function effectiveTarget(
  goal: Pick<GoalWithWallet, 'targetMode' | 'targetAmount' | 'targetMonths'>,
  avgExpense: AvgExpense | null,
): { target: bigint | null; note: string | null } {
  if (goal.targetMode === 'MANUAL') return { target: goal.targetAmount, note: null };
  if (!avgExpense) {
    return { target: null, note: 'Belum ada data pengeluaran 3 bulan penuh terakhir untuk menghitung target.' };
  }
  return { target: BigInt(goal.targetMonths ?? 6) * avgExpense.avg, note: null };
}

/** Estimasi bulan menuju target dari rata-rata setoran bersih (maks. 3 bulan terakhir, sejak kontribusi pertama). */
export function estimateMonths(
  remaining: bigint | null,
  stats: ContributionStats | undefined,
  currentMonth: string,
): number | null {
  if (remaining === null) return null;
  if (remaining === 0n) return 0;
  if (!stats) return null;
  const firstMonth = stats.firstDate.toISOString().slice(0, 7);
  const monthsActive = Math.min(ESTIMATE_WINDOW_MONTHS, Math.max(1, monthIndex(currentMonth) - monthIndex(firstMonth) + 1));
  const avgNet = stats.windowNet / BigInt(monthsActive);
  if (avgNet <= 0n) return null;
  return Number((remaining + avgNet - 1n) / avgNet);
}

@Injectable()
export class SavingsService {
  constructor(
    private repository: SavingsRepository,
    private wallets: WalletsService,
  ) {}

  // ---------- Goals ----------

  async list(userId: string, includeArchived = false): Promise<GoalResponse[]> {
    const currentMonth = getCurrentMonthJakarta();
    const [goals, collected, stats] = await Promise.all([
      this.repository.findGoals(userId, includeArchived),
      this.repository.collectedByGoal(userId),
      this.repository.contributionStats(
        userId,
        getMonthRange(shiftMonth(currentMonth, -(ESTIMATE_WINDOW_MONTHS - 1))).start,
        getMonthRange(currentMonth).endExclusive,
      ),
    ]);
    const avg = goals.some((g) => g.targetMode === 'MONTHS_OF_EXPENSE') ? await this.averageMonthlyExpense(userId) : null;
    return goals.map((g) => this.toGoalResponse(g, collected.get(g.id) ?? 0n, stats.get(g.id), avg, currentMonth));
  }

  async get(userId: string, id: string): Promise<GoalResponse> {
    const goals = await this.list(userId, true);
    const found = goals.find((g) => g.id === id);
    if (!found) throw new NotFoundException('Goal tidak ditemukan');
    return found;
  }

  async create(userId: string, input: CreateGoalInput): Promise<GoalResponse> {
    if (input.type === 'EMERGENCY' && (await this.repository.hasActiveEmergency(userId))) {
      throw new ConflictException('Sudah ada goal Dana Darurat yang aktif. Arsipkan dulu sebelum membuat yang baru.');
    }
    if (input.walletId) await this.assertUsableWallet(userId, input.walletId);

    const mode = input.targetMode ?? 'MANUAL';
    const created = await this.repository.createGoal(userId, {
      name: input.name,
      type: input.type,
      icon: input.icon ?? null,
      color: input.color ?? null,
      targetMode: mode,
      targetAmount: mode === 'MANUAL' ? (input.targetAmount ?? null) : null,
      targetMonths: mode === 'MONTHS_OF_EXPENSE' ? (input.targetMonths ?? 6) : null,
      targetDate: input.targetDate ? toDate(input.targetDate) : null,
      walletId: input.walletId ?? null,
    });
    return this.get(userId, created.id);
  }

  async update(userId: string, id: string, input: UpdateGoalInput): Promise<GoalResponse> {
    const existing = await this.getOwnedGoal(userId, id);
    if (input.walletId) await this.assertUsableWallet(userId, input.walletId);
    if (input.isArchived === false && existing.isArchived && existing.type === 'EMERGENCY') {
      if (await this.repository.hasActiveEmergency(userId, id)) {
        throw new ConflictException('Sudah ada goal Dana Darurat yang aktif, goal ini tidak bisa diaktifkan kembali.');
      }
    }

    const mode = input.targetMode ?? existing.targetMode;
    const data: GoalWriteData = {
      targetMode: mode,
      targetAmount: mode === 'MANUAL' ? (input.targetAmount !== undefined ? input.targetAmount : existing.targetAmount) : null,
      targetMonths:
        mode === 'MONTHS_OF_EXPENSE' ? (input.targetMonths !== undefined ? input.targetMonths : existing.targetMonths) ?? 6 : null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.color !== undefined) data.color = input.color;
    if (input.targetDate !== undefined) data.targetDate = input.targetDate ? toDate(input.targetDate) : null;
    if (input.walletId !== undefined) data.walletId = input.walletId;
    if (input.isArchived !== undefined) data.isArchived = input.isArchived;

    await this.repository.updateGoal(userId, id, data);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwnedGoal(userId, id);
    if ((await this.repository.countContributions(userId, id)) > 0) {
      throw new ConflictException('Goal sudah memiliki riwayat kontribusi dan tidak bisa dihapus. Arsipkan goal ini sebagai gantinya.');
    }
    await this.repository.deleteGoal(userId, id);
  }

  /** Dipakai modul alokasi: goal harus milik user (else 404). */
  async getOwnedGoal(userId: string, id: string): Promise<GoalWithWallet> {
    const goal = await this.repository.findGoal(userId, id);
    if (!goal) throw new NotFoundException('Goal tidak ditemukan');
    return goal;
  }

  netByGoalInRange(userId: string, start: Date, endExclusive: Date): Promise<Map<string, bigint>> {
    return this.repository.netByGoalInRange(userId, start, endExclusive);
  }

  // ---------- Contributions ----------

  async listContributions(userId: string, goalId: string, limit: number): Promise<ContributionResponse[]> {
    await this.getOwnedGoal(userId, goalId);
    const rows = await this.repository.findContributions(userId, goalId, limit);
    return rows.map(toContributionResponse);
  }

  async addContribution(userId: string, goalId: string, input: CreateContributionInput): Promise<ContributionResponse> {
    const goal = await this.getOwnedGoal(userId, goalId);
    if (goal.isArchived) throw new BadRequestException('Goal sudah diarsipkan, kontribusi baru tidak bisa ditambahkan.');
    const date = input.date ? toDate(input.date) : getTodayInJakarta();

    // Dompet penyimpanan: milik goal; untuk goal tanpa dompet boleh dipilih per transaksi (counterWalletId).
    const storageWalletId = goal.walletId ?? input.counterWalletId ?? null;
    let transfer: { walletId: string; toWalletId: string } | null = null;
    if (input.walletId) {
      if (!storageWalletId) {
        throw new BadRequestException(
          input.type === 'DEPOSIT'
            ? 'Pilih dompet tujuan untuk setoran ini, atau kosongkan dompet sumber.'
            : 'Pilih dompet asal untuk penarikan ini, atau kosongkan dompet tujuan.',
        );
      }
      if (input.walletId === storageWalletId) {
        throw new BadRequestException('Dompet sumber/tujuan tidak boleh sama dengan dompet penyimpanan goal.');
      }
      await this.assertUsableWallet(userId, input.walletId);
      await this.assertUsableWallet(userId, storageWalletId);
      transfer =
        input.type === 'DEPOSIT'
          ? { walletId: input.walletId, toWalletId: storageWalletId }
          : { walletId: storageWalletId, toWalletId: input.walletId };
    } else if (!goal.walletId && input.counterWalletId) {
      throw new BadRequestException('Dompet tujuan/asal harus berpasangan dengan dompet sumber/lawan.');
    }

    const created = await this.repository.runInGoalLock(userId, goalId, async (uow) => {
      if (input.type === 'WITHDRAW' && (await uow.collected()) < input.amount) {
        throw new ConflictException('Saldo goal tidak cukup untuk penarikan ini.');
      }
      const transactionId = transfer
        ? await uow.createTransfer({ ...transfer, amount: input.amount, date, note: `Tabungan: ${goal.name}` })
        : null;
      return uow.createContribution({
        type: input.type,
        amount: input.amount,
        date,
        note: input.note ?? null,
        transactionId,
      });
    });
    return toContributionResponse(created);
  }

  async updateContribution(userId: string, id: string, input: UpdateContributionInput): Promise<ContributionResponse> {
    const existing = await this.getOwnedContribution(userId, id);
    const updated = await this.repository.runInGoalLock(userId, existing.goalId, async (uow) => {
      const current = await uow.findContribution(id);
      if (!current) throw new NotFoundException('Kontribusi tidak ditemukan');

      const newAmount = input.amount ?? current.amount;
      const delta = signed(current.type, newAmount) - signed(current.type, current.amount);
      if (delta < 0n && (await uow.collected()) + delta < 0n) {
        throw new ConflictException('Perubahan ini membuat saldo goal menjadi minus.');
      }

      const result = await uow.updateContribution(id, {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.date !== undefined ? { date: toDate(input.date) } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      if (current.transactionId && (input.amount !== undefined || input.date !== undefined)) {
        await uow.updateTransfer(current.transactionId, {
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.date !== undefined ? { date: toDate(input.date) } : {}),
        });
      }
      return result;
    });
    return toContributionResponse(updated);
  }

  async removeContribution(userId: string, id: string): Promise<void> {
    const existing = await this.getOwnedContribution(userId, id);
    await this.repository.runInGoalLock(userId, existing.goalId, async (uow) => {
      const current = await uow.findContribution(id);
      if (!current) throw new NotFoundException('Kontribusi tidak ditemukan');
      if (current.type === 'DEPOSIT' && (await uow.collected()) - current.amount < 0n) {
        throw new ConflictException('Menghapus setoran ini membuat saldo goal menjadi minus.');
      }
      await uow.deleteContribution(id);
      if (current.transactionId) await uow.deleteTransfer(current.transactionId);
    });
  }

  // ---------- helpers ----------

  private async getOwnedContribution(userId: string, id: string): Promise<SavingsContribution> {
    const contribution = await this.repository.findContribution(userId, id);
    if (!contribution) throw new NotFoundException('Kontribusi tidak ditemukan');
    return contribution;
  }

  private async assertUsableWallet(userId: string, walletId: string): Promise<void> {
    const wallet = await this.wallets.getOwned(userId, walletId);
    if (wallet.isArchived) throw new BadRequestException(`Dompet "${wallet.name}" sudah diarsipkan.`);
  }

  private async averageMonthlyExpense(userId: string): Promise<AvgExpense | null> {
    const current = getCurrentMonthJakarta();
    const totals = await this.repository.monthlyExpenseTotals(
      userId,
      getMonthRange(shiftMonth(current, -3)).start,
      getMonthRange(current).start, // 3 bulan penuh terakhir: bulan berjalan tidak ikut
    );
    return averageExpense(totals);
  }

  private toGoalResponse(
    goal: GoalWithWallet,
    collected: bigint,
    stats: ContributionStats | undefined,
    avgExpense: AvgExpense | null,
    currentMonth: string,
  ): GoalResponse {
    const { target, note } = effectiveTarget(goal, avgExpense);
    const remaining = target === null ? null : target > collected ? target - collected : 0n;
    return {
      id: goal.id,
      name: goal.name,
      type: goal.type,
      icon: goal.icon,
      color: goal.color,
      targetMode: goal.targetMode,
      targetAmount: goal.targetAmount?.toString() ?? null,
      targetMonths: goal.targetMonths,
      targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null,
      walletId: goal.walletId,
      wallet: goal.wallet,
      isArchived: goal.isArchived,
      collected: collected.toString(),
      target: target?.toString() ?? null,
      avgMonthlyExpense: goal.targetMode === 'MONTHS_OF_EXPENSE' ? (avgExpense?.avg.toString() ?? null) : null,
      basisMonths: goal.targetMode === 'MONTHS_OF_EXPENSE' ? (avgExpense?.basisMonths ?? 0) : 0,
      targetNote: note,
      remaining: remaining?.toString() ?? null,
      percent: target === null || target === 0n ? null : percentOf(collected < 0n ? 0n : collected, target),
      estimatedMonths: estimateMonths(remaining, stats, currentMonth),
      createdAt: goal.createdAt,
    };
  }
}

function toContributionResponse(c: SavingsContribution): ContributionResponse {
  return {
    id: c.id,
    goalId: c.goalId,
    type: c.type,
    amount: c.amount.toString(),
    date: c.date.toISOString().slice(0, 10),
    note: c.note,
    transactionId: c.transactionId,
    createdAt: c.createdAt,
  };
}
