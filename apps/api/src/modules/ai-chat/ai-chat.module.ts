import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { BillsModule } from '../bills/bills.module';
import { CategoriesModule } from '../categories/categories.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SavingsModule } from '../savings/savings.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatRepository } from './ai-chat.repository';
import { AiChatService } from './ai-chat.service';
import { ChatToolsService } from './chat-tools.service';

@Module({
  imports: [DashboardModule, TransactionsModule, WalletsModule, SavingsModule, AllocationModule, CategoriesModule, BillsModule],
  controllers: [AiChatController],
  providers: [AiChatService, AiChatRepository, ChatToolsService],
  exports: [AiChatService],
})
export class AiChatModule {}
