import { Module } from '@nestjs/common';
import { TelegramLinkController } from './telegram-link.controller';
import { TelegramLinkRepository } from './telegram-link.repository';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramBotInfo } from './telegram-bot-info';

@Module({
  controllers: [TelegramLinkController],
  providers: [TelegramLinkService, TelegramLinkRepository, TelegramBotInfo],
  exports: [TelegramLinkService, TelegramBotInfo],
})
export class TelegramLinkModule {}
