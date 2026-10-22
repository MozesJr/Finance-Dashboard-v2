import { z } from 'zod';
import { HexColorSchema } from './common';

export const CategoryTypeEnum = z.enum(['INCOME', 'EXPENSE']);
export type CategoryType = z.infer<typeof CategoryTypeEnum>;

const CategoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama kategori wajib diisi')
  .max(50, 'Nama kategori maksimal 50 karakter');

export const CreateCategorySchema = z.object({
  name: CategoryNameSchema,
  type: CategoryTypeEnum,
  icon: z.string().trim().min(1).max(16).nullable().optional(),
  color: HexColorSchema.nullable().optional(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

/** Tipe kategori tidak bisa diubah setelah dibuat. */
export const UpdateCategorySchema = z
  .object({
    name: CategoryNameSchema,
    icon: z.string().trim().min(1).max(16).nullable(),
    color: HexColorSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

export const CategoryListQuerySchema = z.object({
  type: CategoryTypeEnum.optional(),
});

export type CategoryListQuery = z.infer<typeof CategoryListQuerySchema>;

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: CategoryTypeEnum,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.date(),
});

export type Category = z.infer<typeof CategorySchema>;
