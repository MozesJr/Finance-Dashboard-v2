import { z } from 'zod';

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  createdAt: z.date(),
});

export type UserResponseDto = z.infer<typeof UserResponseSchema>;
