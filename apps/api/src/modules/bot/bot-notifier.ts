import { Injectable, Logger } from '@nestjs/common';
import { TelegramLinkService } from '../telegram-link/telegram-link.service';
import { TelegramBotService } from './adapters/telegram/telegram-bot.service';
import type { OutgoingMessage } from './core/types';

/** Kotak keluar dev-only untuk chat simulasi ("sim-…"): dipakai uji e2e tanpa Telegram. */
@Injectable()
export class DevOutbox {
  private readonly boxes = new Map<string, OutgoingMessage[]>();
  push(chatId: string, message: OutgoingMessage): void {
    this.boxes.set(chatId, [...(this.boxes.get(chatId) ?? []), message]);
  }
  drain(chatId: string): OutgoingMessage[] {
    const messages = this.boxes.get(chatId) ?? [];
    this.boxes.delete(chatId);
    return messages;
  }
}

/** Mengirim pesan dari server ke chat yang terhubung ke user (checklist gajian, pengingat tagihan). */
@Injectable()
export class BotNotifier {
  private readonly logger = new Logger(BotNotifier.name);

  constructor(
    private links: TelegramLinkService,
    private telegram: TelegramBotService,
    private outbox: DevOutbox,
  ) {}

  /** true bila terkirim; false bila user belum terhubung / bot tidak aktif. Tidak pernah melempar. */
  async notifyUser(userId: string, message: OutgoingMessage): Promise<boolean> {
    try {
      const chatId = await this.links.getChatId(userId);
      if (!chatId) return false;
      if (chatId.startsWith('sim-')) {
        if (process.env.NODE_ENV !== 'development') return false;
        this.outbox.push(chatId, message);
        return true;
      }
      return await this.telegram.push(chatId, message);
    } catch (error) {
      this.logger.warn(`Notifikasi bot gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      return false;
    }
  }
}
