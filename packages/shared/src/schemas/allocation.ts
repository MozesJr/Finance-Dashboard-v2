import { z } from 'zod';
import { HexColorSchema, MonthStringSchema, PositiveMoneyInputSchema, UuidSchema } from './common';

export const AllocationKindEnum = z.enum(['EXPENSE', 'SAVING']);
export type AllocationKind = z.infer<typeof AllocationKindEnum>;

export const PhaseSchema = z.coerce
  .number()
  .int('Fase harus 1 atau 2')
  .min(1, 'Fase harus 1 atau 2')
  .max(2, 'Fase harus 1 atau 2');

export const AllocationItemInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama pos wajib diisi').max(60, 'Nama pos maksimal 60 karakter'),
    description: z.string().trim().max(200).nullable().optional(),
    kind: AllocationKindEnum,
    percent: z.number().int('Persen harus bilangan bulat').min(0, 'Persen minimal 0').max(100, 'Persen maksimal 100'),
    color: HexColorSchema.nullable().optional(),
    icon: z.string().trim().min(1).max(16).nullable().optional(),
    /** ID kategori sistem berupa slug (bukan UUID). */
    categoryIds: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    goalId: UuidSchema.nullable().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'EXPENSE') {
      if (item.categoryIds.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['categoryIds'], message: 'Pos pengeluaran wajib terhubung ke minimal 1 kategori' });
      }
      if (item.goalId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['goalId'], message: 'Pos pengeluaran tidak memakai goal' });
      }
    } else {
      if (!item.goalId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['goalId'], message: 'Pos tabungan wajib terhubung ke satu goal' });
      }
      if (item.categoryIds.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['categoryIds'], message: 'Pos tabungan tidak memakai kategori' });
      }
    }
  });
export type AllocationItemInput = z.infer<typeof AllocationItemInputSchema>;

/**
 * Seluruh set item satu fase (diganti atomik). Total persen harus 100,
 * nama unik, dan satu kategori hanya boleh di satu pos per fase.
 */
export const PutPhaseItemsSchema = z
  .object({ items: z.array(AllocationItemInputSchema).min(1, 'Minimal 1 pos').max(20, 'Maksimal 20 pos') })
  .superRefine(({ items }, ctx) => {
    const total = items.reduce((acc, i) => acc + i.percent, 0);
    if (total !== 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: `Total persen fase harus 100% (saat ini ${total}%)` });
    }
    const names = new Set<string>();
    const categories = new Map<string, string>();
    for (const [index, item] of items.entries()) {
      const key = item.name.toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'name'], message: `Nama pos "${item.name}" dipakai dua kali` });
      }
      names.add(key);
      for (const categoryId of item.categoryIds) {
        const owner = categories.get(categoryId);
        if (owner) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'categoryIds'],
            message: `Satu kategori hanya boleh di satu pos (sudah dipakai "${owner}")`,
          });
        }
        categories.set(categoryId, item.name);
      }
    }
  });
export type PutPhaseItemsInput = z.infer<typeof PutPhaseItemsSchema>;

export const UpdatePlanSchema = z
  .object({
    monthlyIncome: PositiveMoneyInputSchema,
    activePhase: PhaseSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;

export const TemplateSchema = z.object({ monthlyIncome: PositiveMoneyInputSchema });
export type TemplateInput = z.infer<typeof TemplateSchema>;

export const AllocationQuerySchema = z.object({
  month: MonthStringSchema.optional(),
  phase: PhaseSchema.optional(),
});
export type AllocationQuery = z.infer<typeof AllocationQuerySchema>;
