export {
  CreateGoalSchema,
  UpdateGoalSchema,
  GoalListQuerySchema,
  CreateContributionSchema,
  UpdateContributionSchema,
  type CreateGoalInput,
  type UpdateGoalInput,
  type GoalListQuery,
  type CreateContributionInput,
  type UpdateContributionInput,
} from 'shared';

import { z } from 'zod';

export const ContributionListQuerySchema = z.object({
  limit: z.coerce.number().int('Limit harus bilangan bulat').min(1, 'Limit minimal 1').max(200, 'Limit maksimal 200').default(50),
});
export type ContributionListQuery = z.infer<typeof ContributionListQuerySchema>;
