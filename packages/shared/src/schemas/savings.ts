import { z } from 'zod';
import { DateStringSchema, HexColorSchema, PositiveMoneyInputSchema, UuidSchema } from './common';

export const GoalTypeEnum = z.enum(['EMERGENCY', 'INVESTMENT', 'CUSTOM']);
export type GoalType = z.infer<typeof GoalTypeEnum>;

export const GoalTargetModeEnum = z.enum(['MANUAL', 'MONTHS_OF_EXPENSE']);
export type GoalTargetMode = z.infer<typeof GoalTargetModeEnum>;

export const ContributionTypeEnum = z.enum(['DEPOSIT', 'WITHDRAW']);
export type ContributionType = z.infer<typeof ContributionTypeEnum>;

const GoalNameSchema = z.string().trim().min(1, 'Nama goal wajib diisi').max(60, 'Nama goal maksimal 60 karakter');
const IconSchema = z.string().trim().min(1).max(16);
const TargetMonthsSchema = z.number().int('Jumlah bulan harus bilangan bulat').min(1, 'Minimal 1 bulan').max(60, 'Maksimal 60 bulan');

export const CreateGoalSchema = z.object({
  name: GoalNameSchema,
  type: GoalTypeEnum,
  icon: IconSchema.nullable().optional(),
  color: HexColorSchema.nullable().optional(),
  targetMode: GoalTargetModeEnum.default('MANUAL'),
  targetAmount: PositiveMoneyInputSchema.nullable().optional(),
  targetMonths: TargetMonthsSchema.nullable().optional(),
  targetDate: DateStringSchema.nullable().optional(),
  walletId: UuidSchema.nullable().optional(),
});
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;

/** Tipe goal tidak bisa diubah setelah dibuat. */
export const UpdateGoalSchema = z
  .object({
    name: GoalNameSchema,
    icon: IconSchema.nullable(),
    color: HexColorSchema.nullable(),
    targetMode: GoalTargetModeEnum,
    targetAmount: PositiveMoneyInputSchema.nullable(),
    targetMonths: TargetMonthsSchema.nullable(),
    targetDate: DateStringSchema.nullable(),
    walletId: UuidSchema.nullable(),
    isArchived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;

export const GoalListQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type GoalListQuery = z.infer<typeof GoalListQuerySchema>;

const NoteSchema = z.string().trim().max(200, 'Maksimal 200 karakter');

/**
 * walletId = dompet lawan: sumber dana saat DEPOSIT, tujuan saat WITHDRAW.
 * Jika diisi (dan goal punya dompet), dibuat transaksi TRANSFER terhubung.
 */
export const CreateContributionSchema = z.object({
  type: ContributionTypeEnum,
  amount: PositiveMoneyInputSchema,
  date: DateStringSchema.optional(),
  note: NoteSchema.nullable().optional(),
  walletId: UuidSchema.nullable().optional(),
});
export type CreateContributionInput = z.infer<typeof CreateContributionSchema>;

export const UpdateContributionSchema = z
  .object({
    amount: PositiveMoneyInputSchema,
    date: DateStringSchema,
    note: NoteSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');
export type UpdateContributionInput = z.infer<typeof UpdateContributionSchema>;
