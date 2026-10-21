import { z } from 'zod';
import { LoginSchema } from '@shared/schemas';

export const LoginDtoSchema = LoginSchema;
export type LoginDto = z.infer<typeof LoginDtoSchema>;
