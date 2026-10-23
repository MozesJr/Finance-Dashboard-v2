import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuditLogRepository } from './audit-log.repository';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { BotModule } from '../bot/bot.module';
import { AdminTelegramController } from './admin-telegram.controller';

@Module({
  imports: [UsersModule, AuthModule, BotModule],
  providers: [AdminService, AuditLogRepository],
  controllers: [AdminController, AdminTelegramController],
})
export class AdminModule {}
