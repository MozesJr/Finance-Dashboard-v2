import { z } from 'zod';

export const AuditLogActionEnum = z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE']);
export type AuditLogAction = z.infer<typeof AuditLogActionEnum>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  adminId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  action: AuditLogActionEnum,
  details: z.record(z.unknown()).optional().nullable(),
  createdAt: z.date(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const CreateAuditLogSchema = AuditLogSchema.omit({ id: true, createdAt: true });
export type CreateAuditLogInput = z.infer<typeof CreateAuditLogSchema>;
