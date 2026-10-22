import { Injectable } from '@nestjs/common';
import { AllocationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

const PLAN_INCLUDE = {
  items: {
    include: { categories: { select: { categoryId: true } } },
    orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.AllocationPlanInclude;

export type PlanWithItems = Prisma.AllocationPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

export interface ItemWriteData {
  phase: number;
  name: string;
  description: string | null;
  kind: AllocationKind;
  percent: number;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  linkedGoalId: string | null;
  categoryIds: string[];
}

const toCreate = (item: ItemWriteData): Prisma.AllocationItemCreateWithoutPlanInput => ({
  phase: item.phase,
  name: item.name,
  description: item.description,
  kind: item.kind,
  percent: item.percent,
  color: item.color,
  icon: item.icon,
  sortOrder: item.sortOrder,
  ...(item.linkedGoalId ? { linkedGoal: { connect: { id: item.linkedGoalId } } } : {}),
  categories: { create: item.categoryIds.map((categoryId) => ({ category: { connect: { id: categoryId } } })) },
});

@Injectable()
export class AllocationRepository {
  constructor(private prisma: PrismaService) {}

  findPlan(userId: string): Promise<PlanWithItems | null> {
    return this.prisma.allocationPlan.findUnique({ where: { userId }, include: PLAN_INCLUDE });
  }

  createPlan(
    userId: string,
    data: { monthlyIncome: bigint; activePhase: number; items: ItemWriteData[] },
  ): Promise<PlanWithItems> {
    return this.prisma.allocationPlan.create({
      data: {
        userId,
        monthlyIncome: data.monthlyIncome,
        activePhase: data.activePhase,
        items: { create: data.items.map(toCreate) },
      },
      include: PLAN_INCLUDE,
    });
  }

  async updatePlan(userId: string, data: { monthlyIncome?: bigint; activePhase?: number }): Promise<void> {
    await this.prisma.allocationPlan.updateMany({ where: { userId }, data });
  }

  /** Ganti seluruh item satu fase secara atomik. */
  async replacePhaseItems(planId: string, phase: number, items: ItemWriteData[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.allocationItem.deleteMany({ where: { planId, phase } }),
      ...items.map((item) => this.prisma.allocationItem.create({ data: { ...toCreate(item), plan: { connect: { id: planId } } } })),
    ]);
  }

  /** ID kategori PENGELUARAN yang terlihat oleh user (sistem + milik sendiri) dari daftar ID. */
  async findVisibleExpenseCategoryIds(userId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.category.findMany({
      where: { id: { in: ids }, type: 'EXPENSE', OR: [{ userId: null }, { userId }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Total pengeluaran CONFIRMED per kategori dalam rentang tanggal (agregasi DB). */
  async expenseByCategory(userId: string, start: Date, endExclusive: Date): Promise<Map<string, bigint>> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, status: 'CONFIRMED', type: 'EXPENSE', date: { gte: start, lt: endExclusive }, categoryId: { not: null } },
      _sum: { amount: true },
    });
    return new Map(groups.map((g) => [g.categoryId as string, g._sum.amount ?? 0n]));
  }
}
