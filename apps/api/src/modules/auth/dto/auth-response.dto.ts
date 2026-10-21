import { z } from 'zod';

export const AuthResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string().optional(),
});

export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
