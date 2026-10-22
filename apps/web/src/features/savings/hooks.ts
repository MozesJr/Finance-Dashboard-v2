import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContributionPayload, GoalPayload, PlanItemPayload, savingsApi } from './api';

export const useGoals = (includeArchived = false) =>
  useQuery({ queryKey: ['savings', 'goals', includeArchived], queryFn: () => savingsApi.listGoals(includeArchived) });

export const useContributions = (goalId: string | null) =>
  useQuery({
    queryKey: ['savings', 'contributions', goalId],
    queryFn: () => savingsApi.listContributions(goalId as string),
    enabled: goalId !== null,
  });

export const useAllocationPlan = () => useQuery({ queryKey: ['savings', 'plan'], queryFn: savingsApi.getPlan });

export const useAllocationReport = (month: string, enabled: boolean) =>
  useQuery({ queryKey: ['savings', 'report', month], queryFn: () => savingsApi.getReport(month), enabled });

/** Kontribusi membuat transfer antar dompet, jadi saldo, transaksi, dan dashboard ikut di-refresh. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['savings'] });
    queryClient.invalidateQueries({ queryKey: ['wallets'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateGoal() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (p: GoalPayload) => savingsApi.createGoal(p), onSuccess: invalidate });
}

export function useUpdateGoal() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: GoalPayload }) => savingsApi.updateGoal(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => savingsApi.deleteGoal(id), onSuccess: invalidate });
}

export function useAddContribution() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ goalId, payload }: { goalId: string; payload: ContributionPayload }) =>
      savingsApi.addContribution(goalId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateContribution() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ContributionPayload }) => savingsApi.updateContribution(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteContribution() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => savingsApi.deleteContribution(id), onSuccess: invalidate });
}

export function useCreateFromTemplate() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (income: string) => savingsApi.createFromTemplate(income), onSuccess: invalidate });
}

export function useUpdatePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (payload: { monthlyIncome?: string; activePhase?: number }) => savingsApi.updatePlan(payload),
    onSuccess: invalidate,
  });
}

export function usePutPhaseItems() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ phase, items }: { phase: number; items: PlanItemPayload[] }) => savingsApi.putPhaseItems(phase, items),
    onSuccess: invalidate,
  });
}
