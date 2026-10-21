import { z } from 'zod';

export const UserRoleEnum = z.enum(['ADMIN', 'USER']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const UserStatusEnum = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']);
export type UserStatus = z.infer<typeof UserStatusEnum>;

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[!@#$%^&*]/, 'Password must contain special character'),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: UserRoleEnum,
  status: UserStatusEnum,
  approvedAt: z.date().nullable(),
  approvedById: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
