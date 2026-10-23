import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as path from 'path';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { JwtAuthGuard } from './common/guards';
import { APP_GUARD } from '@nestjs/core';
import { WalletsModule } from './modules/wallets/wallets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SavingsModule } from './modules/savings/savings.module';
import { AllocationModule } from './modules/allocation/allocation.module';
import { MerchantRulesModule } from './modules/merchant-rules/merchant-rules.module';
import { TelegramLinkModule } from './modules/telegram-link/telegram-link.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BotModule } from './modules/bot/bot.module';
import { AiModule } from './modules/ai/ai.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '..', '..', '.env'),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AiModule,
    AuthModule,
    UsersModule,
    AdminModule,
    WalletsModule,
    CategoriesModule,
    TransactionsModule,
    DashboardModule,
    SavingsModule,
    AllocationModule,
    MerchantRulesModule,
    TelegramLinkModule,
    ScheduleModule.forRoot(),
    BotModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule { }
