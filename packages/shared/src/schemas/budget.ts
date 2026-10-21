import { z } from 'zod';

export const CreateBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z
    .string()
    .or(z.bigint())
    .pipe(z.coerce.bigint().positive('Budget amount must be positive')),
  month: z.string().or(z.date()),
});

export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>;

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.string(),
  month: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Budget = z.infer<typeof BudgetSchema>;
