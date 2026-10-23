import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { SavingsModule } from '../savings/savings.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PaydayController } from './payday.controller';
import { PaydayRepository } from './payday.repository';
import { PaydayService } from './payday.service';

@Module({
  imports: [AllocationModule, SavingsModule, TransactionsModule],
  controllers: [PaydayController],
  providers: [PaydayService, PaydayRepository],
  exports: [PaydayService],
})
export class PaydayModule {}
