import { z } from 'zod';

export const UserRoleEnum = z.enum(['ADMIN', 'USER']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const UserStatusEnum = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']);
export type UserStatus = z.infer<typeof UserStatusEnum>;

const PasswordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
  .regex(/[0-9]/, 'Password harus mengandung angka');

export const RegisterSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: PasswordSchema,
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'Password tidak cocok',
  path: ['passwordConfirm'],
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password harus diisi'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: PasswordSchema,
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
