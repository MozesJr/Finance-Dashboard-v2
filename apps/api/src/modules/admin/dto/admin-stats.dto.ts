import { z } from 'zod';

export const AdminStatsDtoSchema = z.object({
  PENDING: z.number(),
  ACTIVE: z.number(),
  REJECTED: z.number(),
  SUSPENDED: z.number(),
});

export type AdminStatsDto = z.infer<typeof AdminStatsDtoSchema>;
