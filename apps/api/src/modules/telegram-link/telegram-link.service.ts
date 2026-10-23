import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'crypto';
import { UserStatus } from '@prisma/client';
import { TelegramLinkRepository } from './telegram-link.repository';
import { TelegramBotInfo } from './telegram-bot-info';

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

export type LinkResult = { ok: true; userId: string } | { ok: false; reason: 'INVALID' | 'CHAT_TAKEN' | 'USER_LINKED' };

export interface LinkStatusResponse {
  botEnabled: boolean;
  botUsername: string | null;
  linked: { username: string | null; linkedAt: Date } | null;
}

export interface ResolvedChat {
  userId: string;
  status: UserStatus;
  username: string | null;
}

@Injectable()
export class TelegramLinkService {
  constructor(
    private repository: TelegramLinkRepository,
    private config: ConfigService,
    private botInfo: TelegramBotInfo,
  ) {}

  async getStatus(userId: string): Promise<LinkStatusResponse> {
    const link = await this.repository.findByUser(userId);
    return {
      botEnabled: this.botInfo.enabled,
      botUsername: this.botInfo.username,
      linked: link ? { username: link.username, linkedAt: link.linkedAt } : null,
    };
  }

  /** Kode 6 digit sekali pakai, berlaku 10 menit. Hanya hash yang disimpan. */
  async createCode(userId: string): Promise<{ code: string; expiresAt: Date; botUsername: string | null }> {
    if (await this.repository.findByUser(userId)) {
      throw new ConflictException('Akun sudah terhubung ke Telegram. Putuskan dulu untuk menghubungkan chat lain.');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    await this.repository.replaceCode(userId, this.hash(code), expiresAt);
    return { code, expiresAt, botUsername: this.botInfo.username };
  }

  async unlink(userId: string): Promise<void> {
    await this.repository.deleteByUser(userId);
  }

  async unlinkChat(chatId: string): Promise<boolean> {
    return this.repository.deleteByChat(chatId);
  }

  async resolveChat(chatId: string): Promise<ResolvedChat | null> {
    const link = await this.repository.findByChat(chatId);
    return link ? { userId: link.user.id, status: link.user.status, username: link.username } : null;
  }

  /** Dipanggil dari bot: tukar kode dengan link chat ↔ user. */
  async linkByCode(rawCode: string, chatId: string, username: string | null): Promise<LinkResult> {
    const code = rawCode.trim();
    if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'INVALID' };

    const found = await this.repository.findActiveCode(this.hash(code), new Date());
    if (!found) return { ok: false, reason: 'INVALID' };

    if (await this.repository.findByChat(chatId)) return { ok: false, reason: 'CHAT_TAKEN' };
    if (await this.repository.findByUser(found.userId)) return { ok: false, reason: 'USER_LINKED' };

    try {
      await this.repository.linkAndConsume(found.id, found.userId, chatId, username);
    } catch (error) {
      if (TelegramLinkRepository.isUniqueViolation(error)) return { ok: false, reason: 'CHAT_TAKEN' };
      throw error;
    }
    return { ok: true, userId: found.userId };
  }

  cleanupExpiredCodes(): Promise<number> {
    return this.repository.deleteExpiredCodes(new Date(Date.now() - LINK_CODE_TTL_MS));
  }

  hash(code: string): string {
    const secret = this.config.get<string>('TELEGRAM_LINK_SECRET') ?? this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET atau TELEGRAM_LINK_SECRET wajib diisi untuk hash kode link.');
    return createHmac('sha256', secret).update(code).digest('hex');
  }
}
