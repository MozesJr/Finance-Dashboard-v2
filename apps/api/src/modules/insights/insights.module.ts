import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SavingsModule } from '../savings/savings.module';
import { InsightStatsService } from './insight-stats.service';
import { InsightsController } from './insights.controller';
import { InsightsJobService } from './insights-job.service';
import { InsightsRepository } from './insights.repository';
import { InsightsService } from './insights.service';

@Module({
  imports: [DashboardModule, AllocationModule, SavingsModule],
  controllers: [InsightsController],
  providers: [InsightsService, InsightStatsService, InsightsRepository, InsightsJobService],
  exports: [InsightsService],
})
export class InsightsModule {}
