import { z } from 'zod';

export const CategoryTypeEnum = z.enum(['INCOME', 'EXPENSE']);
export type CategoryType = z.infer<typeof CategoryTypeEnum>;

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  type: CategoryTypeEnum,
  icon: z.string().optional(),
  color: z.string().optional(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const CategorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  name: z.string(),
  type: CategoryTypeEnum,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.date(),
});

export type Category = z.infer<typeof CategorySchema>;
