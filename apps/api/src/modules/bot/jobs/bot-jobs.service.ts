import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TelegramLinkService } from '../../telegram-link/telegram-link.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { BotPendingRepository } from '../bot-pending.repository';

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING_TTL_MS = 60 * 60 * 1000;

/** Pembersihan berkala: draft kedaluwarsa (24 jam), input tertunda (1 jam), kode link kedaluwarsa. */
@Injectable()
export class BotJobsService {
  private readonly logger = new Logger(BotJobsService.name);

  constructor(
    private transactions: TransactionsService,
    private pending: BotPendingRepository,
    private links: TelegramLinkService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<{ drafts: number; pending: number; codes: number }> {
    const now = Date.now();
    const [drafts, pending, codes] = await Promise.all([
      this.transactions.deleteExpiredDrafts(new Date(now - DRAFT_TTL_MS)),
      this.pending.deleteOlderThan(new Date(now - PENDING_TTL_MS)),
      this.links.cleanupExpiredCodes(),
    ]);
    if (drafts + pending + codes > 0) {
      this.logger.log(`Pembersihan: ${drafts} draft, ${pending} input tertunda, ${codes} kode link dihapus.`);
    }
    return { drafts, pending, codes };
  }
}
