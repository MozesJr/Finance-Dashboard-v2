import { Injectable, NotFoundException } from '@nestjs/common';
import { ContributionType, Prisma, SavingsContribution } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

const GOAL_INCLUDE = { wallet: { select: { id: true, name: true } } } satisfies Prisma.SavingsGoalInclude;
export type GoalWithWallet = Prisma.SavingsGoalGetPayload<{ include: typeof GOAL_INCLUDE }>;

export interface GoalWriteData {
  name?: string;
  icon?: string | null;
  color?: string | null;
  targetMode?: 'MANUAL' | 'MONTHS_OF_EXPENSE';
  targetAmount?: bigint | null;
  targetMonths?: number | null;
  targetDate?: Date | null;
  walletId?: string | null;
  isArchived?: boolean;
}

export interface ContributionStats {
  /** Setoran bersih dalam jendela waktu. */
  windowNet: bigint;
  /** Tanggal kontribusi pertama (seluruh riwayat). */
  firstDate: Date;
}

export interface MonthlyTotal {
  month: string; // YYYY-MM
  total: bigint;
}

export interface TransferWriteData {
  walletId: string;
  toWalletId: string;
  amount: bigint;
  date: Date;
  note: string;
}

export interface ContributionWriteData {
  type: ContributionType;
  amount: bigint;
  date: Date;
  note: string | null;
  transactionId: string | null;
}

/**
 * Operasi di dalam satu transaksi DB dengan baris goal terkunci (FOR UPDATE).
 * Semua penulisan kontribusi + transfer terhubung lewat sini sehingga atomik.
 */
export interface GoalUnitOfWork {
  collected(): Promise<bigint>;
  findContribution(id: string): Promise<SavingsContribution | null>;
  createTransfer(data: TransferWriteData): Promise<string>;
  updateTransfer(id: string, data: { amount?: bigint; date?: Date }): Promise<void>;
  deleteTransfer(id: string): Promise<void>;
  createContribution(data: ContributionWriteData): Promise<SavingsContribution>;
  updateContribution(id: string, data: { amount?: bigint; date?: Date; note?: string | null }): Promise<SavingsContribution>;
  deleteContribution(id: string): Promise<void>;
}

class PrismaGoalUnitOfWork implements GoalUnitOfWork {
  constructor(
    private tx: Prisma.TransactionClient,
    private userId: string,
    private goalId: string,
  ) {}

  async collected(): Promise<bigint> {
    const rows = await this.tx.$queryRaw<Array<{ collected: bigint | null }>>`
      SELECT SUM(CASE type WHEN 'DEPOSIT' THEN amount ELSE -amount END)::bigint AS collected
      FROM savings_contributions
      WHERE goal_id = ${this.goalId} AND user_id = ${this.userId}
    `;
    return rows[0]?.collected ?? 0n;
  }

  findContribution(id: string) {
    return this.tx.savingsContribution.findFirst({ where: { id, goalId: this.goalId, userId: this.userId } });
  }

  async createTransfer(data: TransferWriteData): Promise<string> {
    const created = await this.tx.transaction.create({
      data: {
        userId: this.userId,
        type: 'TRANSFER',
        walletId: data.walletId,
        toWalletId: data.toWalletId,
        amount: data.amount,
        date: data.date,
        note: data.note,
        source: 'WEB',
        status: 'CONFIRMED',
      },
      select: { id: true },
    });
    return created.id;
  }

  async updateTransfer(id: string, data: { amount?: bigint; date?: Date }) {
    await this.tx.transaction.updateMany({ where: { id, userId: this.userId }, data });
  }

  async deleteTransfer(id: string) {
    await this.tx.transaction.deleteMany({ where: { id, userId: this.userId } });
  }

  createContribution(data: ContributionWriteData) {
    return this.tx.savingsContribution.create({ data: { ...data, goalId: this.goalId, userId: this.userId } });
  }

  async updateContribution(id: string, data: { amount?: bigint; date?: Date; note?: string | null }) {
    await this.tx.savingsContribution.updateMany({ where: { id, userId: this.userId }, data });
    return this.tx.savingsContribution.findFirstOrThrow({ where: { id, userId: this.userId } });
  }

  async deleteContribution(id: string) {
    await this.tx.savingsContribution.deleteMany({ where: { id, userId: this.userId } });
  }
}

@Injectable()
export class SavingsRepository {
  constructor(private prisma: PrismaService) {}

  findGoals(userId: string, includeArchived: boolean): Promise<GoalWithWallet[]> {
    return this.prisma.savingsGoal.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      include: GOAL_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findGoal(userId: string, id: string): Promise<GoalWithWallet | null> {
    return this.prisma.savingsGoal.findFirst({ where: { id, userId }, include: GOAL_INCLUDE });
  }

  async hasActiveEmergency(userId: string, excludeGoalId?: string): Promise<boolean> {
    const count = await this.prisma.savingsGoal.count({
      where: { userId, type: 'EMERGENCY', isArchived: false, ...(excludeGoalId ? { id: { not: excludeGoalId } } : {}) },
    });
    return count > 0;
  }

  createGoal(
    userId: string,
    data: GoalWriteData & { name: string; type: 'EMERGENCY' | 'INVESTMENT' | 'CUSTOM' },
  ): Promise<GoalWithWallet> {
    return this.prisma.savingsGoal.create({ data: { ...data, userId }, include: GOAL_INCLUDE });
  }

  async updateGoal(userId: string, id: string, data: GoalWriteData): Promise<void> {
    await this.prisma.savingsGoal.updateMany({ where: { id, userId }, data });
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    await this.prisma.savingsGoal.deleteMany({ where: { id, userId } });
  }

  async countContributions(userId: string, goalId: string): Promise<number> {
    return this.prisma.savingsContribution.count({ where: { userId, goalId } });
  }

  /** Terkumpul per goal (DEPOSIT − WITHDRAW), satu query. */
  async collectedByGoal(userId: string): Promise<Map<string, bigint>> {
    const rows = await this.prisma.$queryRaw<Array<{ goal_id: string; collected: bigint }>>`
      SELECT goal_id, SUM(CASE type WHEN 'DEPOSIT' THEN amount ELSE -amount END)::bigint AS collected
      FROM savings_contributions
      WHERE user_id = ${userId}
      GROUP BY goal_id
    `;
    return new Map(rows.map((r) => [r.goal_id, r.collected]));
  }

  /** Setoran bersih dalam jendela + tanggal kontribusi pertama, per goal. */
  async contributionStats(userId: string, windowStart: Date, windowEndExclusive: Date): Promise<Map<string, ContributionStats>> {
    const rows = await this.prisma.$queryRaw<Array<{ goal_id: string; window_net: bigint; first_date: Date }>>`
      SELECT goal_id,
             SUM(CASE WHEN date >= ${windowStart}::date AND date < ${windowEndExclusive}::date
                      THEN CASE type WHEN 'DEPOSIT' THEN amount ELSE -amount END ELSE 0 END)::bigint AS window_net,
             MIN(date) AS first_date
      FROM savings_contributions
      WHERE user_id = ${userId}
      GROUP BY goal_id
    `;
    return new Map(rows.map((r) => [r.goal_id, { windowNet: r.window_net, firstDate: r.first_date }]));
  }

  /** Setoran bersih per goal dalam rentang tanggal (dipakai realisasi alokasi). */
  async netByGoalInRange(userId: string, start: Date, endExclusive: Date): Promise<Map<string, bigint>> {
    const rows = await this.prisma.$queryRaw<Array<{ goal_id: string; net: bigint }>>`
      SELECT goal_id, SUM(CASE type WHEN 'DEPOSIT' THEN amount ELSE -amount END)::bigint AS net
      FROM savings_contributions
      WHERE user_id = ${userId} AND date >= ${start}::date AND date < ${endExclusive}::date
      GROUP BY goal_id
    `;
    return new Map(rows.map((r) => [r.goal_id, r.net]));
  }

  /** Total pengeluaran CONFIRMED per bulan (hanya bulan yang punya data). */
  async monthlyExpenseTotals(userId: string, start: Date, endExclusive: Date): Promise<MonthlyTotal[]> {
    return this.prisma.$queryRaw<MonthlyTotal[]>`
      SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount)::bigint AS total
      FROM transactions
      WHERE user_id = ${userId} AND status = 'CONFIRMED' AND type = 'EXPENSE'
        AND date >= ${start}::date AND date < ${endExclusive}::date
      GROUP BY 1
    `;
  }

  findContributions(userId: string, goalId: string, limit: number): Promise<SavingsContribution[]> {
    return this.prisma.savingsContribution.findMany({
      where: { userId, goalId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  findContribution(userId: string, id: string): Promise<SavingsContribution | null> {
    return this.prisma.savingsContribution.findFirst({ where: { id, userId } });
  }

  /** Jalankan fn dalam satu transaksi DB dengan baris goal terkunci. */
  runInGoalLock<T>(userId: string, goalId: string, fn: (uow: GoalUnitOfWork) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM savings_goals WHERE id = ${goalId} AND user_id = ${userId} FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundException('Goal tidak ditemukan');
      return fn(new PrismaGoalUnitOfWork(tx, userId, goalId));
    });
  }
}
