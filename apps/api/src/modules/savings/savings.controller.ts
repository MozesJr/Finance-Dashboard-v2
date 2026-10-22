import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { SavingsService } from './savings.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { parseUuid } from '../../common/pipes/parse-uuid.pipe';
import {
  ContributionListQuery,
  ContributionListQuerySchema,
  CreateContributionInput,
  CreateContributionSchema,
  CreateGoalInput,
  CreateGoalSchema,
  GoalListQuery,
  GoalListQuerySchema,
  UpdateContributionInput,
  UpdateContributionSchema,
  UpdateGoalInput,
  UpdateGoalSchema,
} from './dto/savings.dto';

@Controller('savings')
export class SavingsController {
  constructor(private savingsService: SavingsService) {}

  @Get('goals')
  list(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(GoalListQuerySchema)) query: GoalListQuery,
  ) {
    return this.savingsService.list(user.userId, query.includeArchived);
  }

  @Get('goals/:id')
  get(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    return this.savingsService.get(user.userId, id);
  }

  @Post('goals')
  create(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(CreateGoalSchema)) body: CreateGoalInput) {
    return this.savingsService.create(user.userId, body);
  }

  @Patch('goals/:id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(UpdateGoalSchema)) body: UpdateGoalInput,
  ) {
    return this.savingsService.update(user.userId, id, body);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    await this.savingsService.remove(user.userId, id);
  }

  @Get('goals/:id/contributions')
  listContributions(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Query(new ZodValidationPipe(ContributionListQuerySchema)) query: ContributionListQuery,
  ) {
    return this.savingsService.listContributions(user.userId, id, query.limit);
  }

  @Post('goals/:id/contributions')
  addContribution(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(CreateContributionSchema)) body: CreateContributionInput,
  ) {
    return this.savingsService.addContribution(user.userId, id, body);
  }

  @Patch('contributions/:id')
  updateContribution(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(UpdateContributionSchema)) body: UpdateContributionInput,
  ) {
    return this.savingsService.updateContribution(user.userId, id, body);
  }

  @Delete('contributions/:id')
  @HttpCode(204)
  async removeContribution(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    await this.savingsService.removeContribution(user.userId, id);
  }
}
