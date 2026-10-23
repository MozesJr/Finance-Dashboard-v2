import http from '@/lib/http';
import type { AllocationKind, ContributionType, GoalTargetMode, GoalType } from 'shared';

export interface GoalDto {
  id: string;
  name: string;
  type: GoalType;
  icon: string | null;
  color: string | null;
  targetMode: GoalTargetMode;
  targetAmount: string | null;
  targetMonths: number | null;
  targetDate: string | null;
  walletId: string | null;
  wallet: { id: string; name: string } | null;
  isArchived: boolean;
  collected: string;
  target: string | null;
  avgMonthlyExpense: string | null;
  basisMonths: number;
  targetNote: string | null;
  remaining: string | null;
  percent: number | null;
  estimatedMonths: number | null;
  createdAt: string;
}

export interface GoalPayload {
  name?: string;
  type?: GoalType;
  icon?: string | null;
  color?: string | null;
  targetMode?: GoalTargetMode;
  targetAmount?: string | null;
  targetMonths?: number | null;
  targetDate?: string | null;
  walletId?: string | null;
  isArchived?: boolean;
}

export interface ContributionDto {
  id: string;
  goalId: string;
  type: ContributionType;
  amount: string;
  date: string;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
}

export interface ContributionPayload {
  type?: ContributionType;
  amount?: string;
  date?: string;
  note?: string | null;
  walletId?: string | null;
  /** Goal tanpa dompet penyimpanan: dompet tujuan (setor) / asal (tarik). */
  counterWalletId?: string | null;
}

export type AllocationStatus = 'BELUM_ADA' | 'AMAN' | 'HAMPIR' | 'LEBIH' | 'KURANG' | 'TERCAPAI';

export interface PlanItemDto {
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

export interface PlanDto {
  id: string;
  monthlyIncome: string;
  activePhase: number;
  phases: { 1: PlanItemDto[]; 2: PlanItemDto[] };
}

export interface PlanItemPayload {
  name: string;
  description?: string | null;
  kind: AllocationKind;
  percent: number;
  color?: string | null;
  icon?: string | null;
  categoryIds: string[];
  goalId?: string | null;
}

export interface ReportItemDto {
  id: string;
  name: string;
  description: string | null;
  kind: AllocationKind;
  color: string | null;
  icon: string | null;
  percent: number;
  goalId: string | null;
  goalName: string | null;
  dialihkan: boolean;
  planned: string;
  realized: string;
  remaining: string;
  diff: string;
  usedPercent: number | null;
  status: AllocationStatus;
  /** Cadangan per periode untuk tagihan berkala yang kategorinya termasuk pos ini. */
  reserved: string;
}

export interface ReportDto {
  month: string;
  isCurrentMonth: boolean;
  phase: number;
  activePhase: number;
  monthlyIncome: string;
  suggestPhase2: boolean;
  items: ReportItemDto[];
  totals: { planned: string; realized: string; remaining: string; diff: string };
}

export const savingsApi = {
  listGoals: async (includeArchived: boolean): Promise<GoalDto[]> =>
    (await http.get('/savings/goals', { params: { includeArchived } })).data,
  createGoal: async (payload: GoalPayload): Promise<GoalDto> => (await http.post('/savings/goals', payload)).data,
  updateGoal: async (id: string, payload: GoalPayload): Promise<GoalDto> =>
    (await http.patch(`/savings/goals/${id}`, payload)).data,
  deleteGoal: async (id: string): Promise<void> => {
    await http.delete(`/savings/goals/${id}`);
  },
  listContributions: async (goalId: string): Promise<ContributionDto[]> =>
    (await http.get(`/savings/goals/${goalId}/contributions`)).data,
  addContribution: async (goalId: string, payload: ContributionPayload): Promise<ContributionDto> =>
    (await http.post(`/savings/goals/${goalId}/contributions`, payload)).data,
  updateContribution: async (id: string, payload: ContributionPayload): Promise<ContributionDto> =>
    (await http.patch(`/savings/contributions/${id}`, payload)).data,
  deleteContribution: async (id: string): Promise<void> => {
    await http.delete(`/savings/contributions/${id}`);
  },

  getPlan: async (): Promise<PlanDto | null> => (await http.get('/savings/allocation/plan')).data.plan,
  getReport: async (month: string): Promise<ReportDto> => (await http.get('/savings/allocation', { params: { month } })).data,
  createFromTemplate: async (monthlyIncome: string): Promise<PlanDto> =>
    (await http.post('/savings/allocation/from-template', { monthlyIncome })).data,
  updatePlan: async (payload: { monthlyIncome?: string; activePhase?: number }): Promise<PlanDto> =>
    (await http.patch('/savings/allocation', payload)).data,
  putPhaseItems: async (phase: number, items: PlanItemPayload[]): Promise<PlanDto> =>
    (await http.put(`/savings/allocation/phases/${phase}/items`, { items })).data,
};
