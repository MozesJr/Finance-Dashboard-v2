import { z } from 'zod';
import { RegisterSchema } from '@shared/schemas';

export const RegisterDtoSchema = RegisterSchema;
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;
