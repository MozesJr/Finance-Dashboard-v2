import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getCurrentMonthJakarta, getMonthRange, shiftMonth } from 'shared';
import { InsightsRepository } from './insights.repository';
import { InsightsService } from './insights.service';

/** Tanggal 1 pukul 07:00 Asia/Jakarta: insight bulan sebelumnya untuk user aktif yang punya transaksi. */
@Injectable()
export class InsightsJobService {
  private readonly logger = new Logger(InsightsJobService.name);

  constructor(
    private repository: InsightsRepository,
    private insights: InsightsService,
  ) {}

  @Cron('0 7 1 * *', { timeZone: 'Asia/Jakarta' })
  async runMonthly(): Promise<{ month: string; generated: number; failed: number }> {
    const month = shiftMonth(getCurrentMonthJakarta(), -1);
    const { start, endExclusive } = getMonthRange(month);
    const userIds = await this.repository.findActiveUserIdsWithActivity(start, endExclusive);

    let generated = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await this.insights.generate(userId, month, { skipQuota: true }); // berurutan, tidak membebani LLM
        generated++;
      } catch (error) {
        failed++;
        this.logger.warn(`Insight ${month} gagal untuk satu user: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    this.logger.log(`Insight bulanan ${month}: ${generated} berhasil, ${failed} gagal.`);
    return { month, generated, failed };
  }
}
