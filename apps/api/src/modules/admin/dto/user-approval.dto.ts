import { z } from 'zod';

export const UserApprovalDtoSchema = z.object({
  targetUserId: z.string().uuid('ID user harus UUID yang valid'),
});

export type UserApprovalDto = z.infer<typeof UserApprovalDtoSchema>;
