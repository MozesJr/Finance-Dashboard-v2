import { Module } from '@nestjs/common';
import { AllocationController } from './allocation.controller';
import { AllocationService } from './allocation.service';
import { AllocationRepository } from './allocation.repository';
import { SavingsModule } from '../savings/savings.module';

@Module({
  imports: [SavingsModule],
  controllers: [AllocationController],
  providers: [AllocationService, AllocationRepository],
  exports: [AllocationService],
})
export class AllocationModule {}
