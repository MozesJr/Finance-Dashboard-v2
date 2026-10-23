import { Injectable } from '@nestjs/common';
import { AllocationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { sharesSql } from '../periods/periods.repository';

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

  /** Total pengeluaran CONFIRMED per kategori untuk satu periode keuangan, dengan pembagian biaya (agregasi DB). */
  async expenseByCategory(userId: string, periodKey: string, startDay: number): Promise<Map<string, bigint>> {
    const rows = await this.prisma.$queryRaw<Array<{ category_id: string; total: bigint }>>`
      SELECT s.category_id, SUM(s.share)::bigint AS total
      FROM ${sharesSql(userId, startDay)} s
      WHERE s.type = 'EXPENSE' AND s.category_id IS NOT NULL AND s.period_key = ${periodKey}
      GROUP BY s.category_id
    `;
    return new Map(rows.map((r) => [r.category_id, r.total]));
  }
}
