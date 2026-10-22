import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  DashboardByCategoryQuery,
  DashboardByCategoryQuerySchema,
  DashboardSummaryQuery,
  DashboardSummaryQuerySchema,
  DashboardTrendQuery,
  DashboardTrendQuerySchema,
} from './dto/dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(DashboardSummaryQuerySchema)) query: DashboardSummaryQuery,
  ) {
    return this.dashboardService.summary(user.userId, query);
  }

  @Get('by-category')
  byCategory(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(DashboardByCategoryQuerySchema)) query: DashboardByCategoryQuery,
  ) {
    return this.dashboardService.byCategory(user.userId, query);
  }

  @Get('trend')
  trend(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(DashboardTrendQuerySchema)) query: DashboardTrendQuery,
  ) {
    return this.dashboardService.trend(user.userId, query);
  }
}
