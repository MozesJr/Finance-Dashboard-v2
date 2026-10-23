import { Injectable } from '@nestjs/common';

/** Status bot yang dibagikan ke halaman web (diisi oleh adapter Telegram saat start). */
@Injectable()
export class TelegramBotInfo {
  enabled = false;
  username: string | null = null;
}
