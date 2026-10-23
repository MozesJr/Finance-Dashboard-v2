import { Module } from '@nestjs/common';
import { AllocationModule } from '../allocation/allocation.module';
import { CategoriesModule } from '../categories/categories.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { InsightsModule } from '../insights/insights.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { SavingsModule } from '../savings/savings.module';
import { TelegramLinkModule } from '../telegram-link/telegram-link.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { TelegramBotService } from './adapters/telegram/telegram-bot.service';
import { TelegramWebhookController } from './adapters/telegram/telegram-webhook.controller';
import { BotPendingRepository } from './bot-pending.repository';
import { BotCore } from './core/bot-core.service';
import { LinkLockout } from './core/link-lockout';
import { DraftCallbackHandler } from './core/handlers/draft-callback.handler';
import { ChatHandler } from './core/handlers/chat.handler';
import { InputHandler } from './core/handlers/input.handler';
import { InsightHandler } from './core/handlers/insight.handler';
import { ReceiptHandler } from './core/handlers/receipt.handler';
import { ReportsHandler } from './core/handlers/reports.handler';
import { DevBotController } from './dev/dev-bot.controller';
import { BotJobsService } from './jobs/bot-jobs.service';

// Endpoint simulasi hanya didaftarkan di mode development.
const devControllers = process.env.NODE_ENV === 'development' ? [DevBotController] : [];

@Module({
  imports: [
    WalletsModule,
    CategoriesModule,
    TransactionsModule,
    MerchantRulesModule,
    DashboardModule,
    SavingsModule,
    AllocationModule,
    TelegramLinkModule,
    ReceiptsModule,
    AiChatModule,
    InsightsModule,
  ],
  controllers: [TelegramWebhookController, ...devControllers],
  providers: [
    BotCore,
    LinkLockout,
    InputHandler,
    ReceiptHandler,
    ChatHandler,
    InsightHandler,
    DraftCallbackHandler,
    ReportsHandler,
    BotPendingRepository,
    TelegramBotService,
    BotJobsService,
  ],
  exports: [LinkLockout],
})
export class BotModule {}
