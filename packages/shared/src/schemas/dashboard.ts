import { z } from 'zod';
import { MonthStringSchema } from './common';
import { CategoryTypeEnum } from './category';

/** month opsional: default bulan berjalan (Asia/Jakarta), diisi di service. */
export const DashboardSummaryQuerySchema = z.object({
  month: MonthStringSchema.optional(),
});
export type DashboardSummaryQuery = z.infer<typeof DashboardSummaryQuerySchema>;

export const DashboardByCategoryQuerySchema = z.object({
  month: MonthStringSchema.optional(),
  type: CategoryTypeEnum.default('EXPENSE'),
});
export type DashboardByCategoryQuery = z.infer<typeof DashboardByCategoryQuerySchema>;

export const DashboardTrendQuerySchema = z.object({
  months: z.coerce.number().int('Jumlah bulan harus bilangan bulat').min(1, 'Minimal 1 bulan').max(24, 'Maksimal 24 bulan').default(6),
});
export type DashboardTrendQuery = z.infer<typeof DashboardTrendQuerySchema>;
