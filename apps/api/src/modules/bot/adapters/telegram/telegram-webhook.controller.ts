import { Body, Controller, ForbiddenException, Headers, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Public } from '../../../../common/decorators';
import { TelegramBotService } from './telegram-bot.service';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Endpoint webhook Telegram (mode production). Publik, tetapi wajib membawa secret token yang cocok. */
@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private bot: TelegramBotService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: unknown) {
    if (!this.bot.webhookEnabled) throw new NotFoundException();
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '';
    if (!expected || !secret || !safeEqual(secret, expected)) throw new ForbiddenException('Secret tidak cocok.');
    await this.bot.handleUpdate(update);
    return { ok: true };
  }
}
