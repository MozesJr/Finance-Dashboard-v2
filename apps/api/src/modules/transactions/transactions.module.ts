import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionEvents } from './transaction-events';
import { TransactionsRepository } from './transactions.repository';
import { WalletsModule } from '../wallets/wallets.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [WalletsModule, CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, TransactionEvents],
  exports: [TransactionsService, TransactionEvents],
})
export class TransactionsModule {}
