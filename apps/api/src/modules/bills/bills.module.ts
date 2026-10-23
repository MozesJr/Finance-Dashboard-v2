import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BillsController } from './bills.controller';
import { BillsRepository } from './bills.repository';
import { BillsService } from './bills.service';

@Module({
  imports: [WalletsModule, CategoriesModule, TransactionsModule],
  controllers: [BillsController],
  providers: [BillsService, BillsRepository],
  exports: [BillsService],
})
export class BillsModule {}
