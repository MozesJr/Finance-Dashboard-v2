import { z } from 'zod';
import { RegisterSchema } from 'shared';

export const RegisterDtoSchema = RegisterSchema;
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;
