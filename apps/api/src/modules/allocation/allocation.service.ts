import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AllocationKind } from '@prisma/client';
import { getPeriodRange, periodLabel, splitByPercent, toDateString } from 'shared';
import type { PeriodInfo } from 'shared';
import { BillsService } from '../bills/bills.service';
import { PeriodsService } from '../periods/periods.service';
import { percentOf } from '../../common/percent';
import { GoalResponse, SavingsService } from '../savings/savings.service';
import { AllocationRepository, ItemWriteData, PlanWithItems } from './allocation.repository';
import { ALLOCATION_TEMPLATE } from './allocation.template';
import { AllocationQuery, PutPhaseItemsInput, TemplateInput, UpdatePlanInput } from './dto/allocation.dto';

export type AllocationStatus = 'BELUM_ADA' | 'AMAN' | 'HAMPIR' | 'LEBIH' | 'KURANG' | 'TERCAPAI';

export interface PlanItemResponse {
  id: string;
  phase: number;
  name: string;
  description: string | null;
  kind: AllocationKind;
  percent: number;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  categoryIds: string[];
  goalId: string | null;
}

export interface PlanResponse {
  id: string;
  monthlyIncome: string;
  activePhase: number;
  phases: { 1: PlanItemResponse[]; 2: PlanItemResponse[] };
}

export interface ReportItem {
  id: string;
  name: string;
  description: string | null;
  kind: AllocationKind;
  color: string | null;
  icon: string | null;
  percent: number;
  goalId: string | null;
  goalName: string | null;
  /** Kategori pengeluaran yang terhubung ke pos (pos EXPENSE). */
  categoryIds: string[];
  /** Pos tabungan 0%: sudah selesai / dialihkan. */
  dialihkan: boolean;
  /** Cadangan per periode untuk tagihan berkala yang kategorinya termasuk pos ini (sudah termasuk dalam realisasi saat dibayar). */
  reserved: string;
  planned: string;
  realized: string;
  /** Sisa anggaran/target (tidak negatif). */
  remaining: string;
  /** realized − planned (positif = melebihi rencana). */
  diff: string;
  /** realized / planned dalam persen (null bila planned 0). */
  usedPercent: number | null;
  status: AllocationStatus;
}

export interface ReportResponse {
  /** Kunci periode (YYYY-MM). */
  month: string;
  period: PeriodInfo;
  isCurrentMonth: boolean;
  phase: number;
  activePhase: number;
  monthlyIncome: string;
  suggestPhase2: boolean;
  items: ReportItem[];
  totals: { planned: string; realized: string; remaining: string; diff: string };
}


/** Status realisasi satu pos. */
export function allocationStatus(kind: AllocationKind, planned: bigint, realized: bigint): AllocationStatus {
  if (kind === 'SAVING') {
    if (realized <= 0n) return 'BELUM_ADA';
    return realized >= planned ? 'TERCAPAI' : 'KURANG';
  }
  if (realized <= 0n) return 'BELUM_ADA';
  if (planned === 0n) return 'LEBIH';
  if (realized * 100n < planned * 80n) return 'AMAN';
  return realized <= planned ? 'HAMPIR' : 'LEBIH';
}

@Injectable()
export class AllocationService {
  constructor(
    private repository: AllocationRepository,
    private savings: SavingsService,
    private periods: PeriodsService,
    private bills: BillsService,
  ) {}

  async getPlan(userId: string): Promise<{ plan: PlanResponse | null }> {
    const plan = await this.repository.findPlan(userId);
    return { plan: plan ? toPlanResponse(plan) : null };
  }

  async report(userId: string, query: AllocationQuery): Promise<ReportResponse> {
    const plan = await this.requirePlan(userId);
    const { key: currentMonth, startDay } = await this.periods.resolve(userId);
    const month = query.month ?? currentMonth;
    const phase = query.phase ?? plan.activePhase;
    const { start, endExclusive } = getPeriodRange(month, startDay);

    const phaseItems = plan.items.filter((i) => i.phase === phase);
    const reserveByCategory = await this.bills.reservePerPeriodByCategory(userId);
    const [planned, expenseByCategory, netByGoal, goals] = await Promise.all([
      Promise.resolve(splitByPercent(plan.monthlyIncome, phaseItems.map((i) => ({ percent: i.percent, sortOrder: i.sortOrder })))),
      this.repository.expenseByCategory(userId, month, startDay),
      this.savings.netByGoalInRange(userId, start, endExclusive),
      this.savings.list(userId, true),
    ]);
    const goalById = new Map(goals.map((g) => [g.id, g]));

    const items = phaseItems.map((item, index): ReportItem => {
      const plannedAmount = planned[index];
      const realized =
        item.kind === 'EXPENSE'
          ? item.categories.reduce((acc, c) => acc + (expenseByCategory.get(c.categoryId) ?? 0n), 0n)
          : item.linkedGoalId
            ? (netByGoal.get(item.linkedGoalId) ?? 0n)
            : 0n;
      const remaining = plannedAmount > realized ? plannedAmount - realized : 0n;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        kind: item.kind,
        color: item.color,
        icon: item.icon,
        percent: item.percent,
        goalId: item.linkedGoalId,
        goalName: item.linkedGoalId ? (goalById.get(item.linkedGoalId)?.name ?? null) : null,
        categoryIds: item.categories.map((c) => c.categoryId),
        dialihkan: item.kind === 'SAVING' && item.percent === 0,
        reserved: (item.kind === 'EXPENSE' ? item.categories.reduce((acc, c) => acc + (reserveByCategory.get(c.categoryId) ?? 0n), 0n) : 0n).toString(),
        planned: plannedAmount.toString(),
        realized: realized.toString(),
        remaining: remaining.toString(),
        diff: (realized - plannedAmount).toString(),
        usedPercent: plannedAmount === 0n ? null : percentOf(realized, plannedAmount),
        status: allocationStatus(item.kind, plannedAmount, realized),
      };
    });

    const sum = (pick: (i: ReportItem) => string) => items.reduce((acc, i) => acc + BigInt(pick(i)), 0n);
    const totalPlanned = sum((i) => i.planned);
    const totalRealized = sum((i) => i.realized);

    return {
      month,
      period: { key: month, label: periodLabel(month, startDay), start: toDateString(start), end: toDateString(new Date(endExclusive.getTime() - 86_400_000)) },
      isCurrentMonth: month === currentMonth,
      phase,
      activePhase: plan.activePhase,
      monthlyIncome: plan.monthlyIncome.toString(),
      suggestPhase2: plan.activePhase === 1 && this.emergencyCompleted(goals),
      items,
      totals: {
        planned: totalPlanned.toString(),
        realized: totalRealized.toString(),
        remaining: (totalPlanned > totalRealized ? totalPlanned - totalRealized : 0n).toString(),
        diff: (totalRealized - totalPlanned).toString(),
      },
    };
  }

  async fromTemplate(userId: string, input: TemplateInput): Promise<PlanResponse> {
    if (await this.repository.findPlan(userId)) {
      throw new ConflictException('Rencana alokasi sudah ada. Ubah lewat pengaturan alokasi.');
    }

    // Goal yang dibutuhkan pos tabungan: pakai yang aktif, atau buat baru.
    const goals = await this.savings.list(userId, false);
    const goalIds: Record<'EMERGENCY' | 'INVESTMENT', string> = {
      EMERGENCY:
        goals.find((g) => g.type === 'EMERGENCY')?.id ??
        (await this.savings.create(userId, { name: 'Dana Darurat', type: 'EMERGENCY', icon: '🛟', targetMode: 'MONTHS_OF_EXPENSE', targetMonths: 6 })).id,
      INVESTMENT:
        goals.find((g) => g.type === 'INVESTMENT')?.id ??
        (await this.savings.create(userId, { name: 'Investasi', type: 'INVESTMENT', icon: '📈', targetMode: 'MANUAL' })).id,
    };

    const allCategoryIds = [...new Set(ALLOCATION_TEMPLATE.flatMap((t) => t.categoryIds))];
    const existing = new Set(await this.repository.findVisibleExpenseCategoryIds(userId, allCategoryIds));

    const items: ItemWriteData[] = ([1, 2] as const).flatMap((phase) =>
      ALLOCATION_TEMPLATE.map((t, index) => ({
        phase,
        name: t.name,
        description: t.description,
        kind: t.kind,
        percent: t.percent[phase],
        color: t.color,
        icon: t.icon,
        sortOrder: index,
        linkedGoalId: t.goalType ? goalIds[t.goalType] : null,
        categoryIds: t.categoryIds.filter((id) => existing.has(id)),
      })),
    );

    const created = await this.repository.createPlan(userId, { monthlyIncome: input.monthlyIncome, activePhase: 1, items });
    return toPlanResponse(created);
  }

  async updatePlan(userId: string, input: UpdatePlanInput): Promise<PlanResponse> {
    const plan = await this.requirePlan(userId);
    if (input.activePhase !== undefined && !plan.items.some((i) => i.phase === input.activePhase)) {
      throw new BadRequestException(`Fase ${input.activePhase} belum punya pos alokasi.`);
    }
    await this.repository.updatePlan(userId, {
      ...(input.monthlyIncome !== undefined ? { monthlyIncome: input.monthlyIncome } : {}),
      ...(input.activePhase !== undefined ? { activePhase: input.activePhase } : {}),
    });
    return this.requirePlanResponse(userId);
  }

  async putPhaseItems(userId: string, phase: number, input: PutPhaseItemsInput): Promise<PlanResponse> {
    const plan = await this.requirePlan(userId);

    const categoryIds = [...new Set(input.items.flatMap((i) => i.categoryIds))];
    const found = new Set(await this.repository.findVisibleExpenseCategoryIds(userId, categoryIds));
    if (categoryIds.some((id) => !found.has(id))) {
      throw new NotFoundException('Ada kategori yang tidak ditemukan atau bukan kategori pengeluaran.');
    }
    for (const goalId of new Set(input.items.flatMap((i) => (i.goalId ? [i.goalId] : [])))) {
      await this.savings.getOwnedGoal(userId, goalId); // 404 bila milik user lain
    }

    await this.repository.replacePhaseItems(
      plan.id,
      phase,
      input.items.map((item, index) => ({
        phase,
        name: item.name,
        description: item.description ?? null,
        kind: item.kind,
        percent: item.percent,
        color: item.color ?? null,
        icon: item.icon ?? null,
        sortOrder: index,
        linkedGoalId: item.kind === 'SAVING' ? (item.goalId ?? null) : null,
        categoryIds: item.kind === 'EXPENSE' ? item.categoryIds : [],
      })),
    );
    return this.requirePlanResponse(userId);
  }

  private emergencyCompleted(goals: GoalResponse[]): boolean {
    const emergency = goals.find((g) => g.type === 'EMERGENCY' && !g.isArchived);
    return emergency?.percent !== null && emergency?.percent !== undefined && emergency.percent >= 100;
  }

  private async requirePlan(userId: string): Promise<PlanWithItems> {
    const plan = await this.repository.findPlan(userId);
    if (!plan) throw new NotFoundException('Belum ada rencana alokasi. Buat dari template terlebih dahulu.');
    return plan;
  }

  private async requirePlanResponse(userId: string): Promise<PlanResponse> {
    return toPlanResponse(await this.requirePlan(userId));
  }
}

function toPlanResponse(plan: PlanWithItems): PlanResponse {
  const byPhase = (phase: number): PlanItemResponse[] =>
    plan.items
      .filter((i) => i.phase === phase)
      .map((i) => ({
        id: i.id,
        phase: i.phase,
        name: i.name,
        description: i.description,
        kind: i.kind,
        percent: i.percent,
        color: i.color,
        icon: i.icon,
        sortOrder: i.sortOrder,
        categoryIds: i.categories.map((c) => c.categoryId),
        goalId: i.linkedGoalId,
      }));
  return {
    id: plan.id,
    monthlyIncome: plan.monthlyIncome.toString(),
    activePhase: plan.activePhase,
    phases: { 1: byPhase(1), 2: byPhase(2) },
  };
}

