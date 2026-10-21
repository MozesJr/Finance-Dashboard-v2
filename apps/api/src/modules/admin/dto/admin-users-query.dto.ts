import { z } from 'zod';

export const AdminUsersQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional(),
});

export type AdminUsersQueryDto = z.infer<typeof AdminUsersQuerySchema>;
