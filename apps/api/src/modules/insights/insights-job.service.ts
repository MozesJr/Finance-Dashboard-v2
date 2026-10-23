import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getPeriodKey, getPeriodRange, getTodayInJakarta, shiftMonth, toDateString } from 'shared';
import { InsightsRepository } from './insights.repository';
import { InsightsService } from './insights.service';

/**
 * Setiap hari 07:00 Asia/Jakarta: untuk user yang HARI INI adalah hari pertama periode barunya
 * (periodStartDay = tanggal hari ini), buat insight periode yang baru berakhir. Hanya user ACTIVE
 * yang punya transaksi di periode itu. periodStartDay maksimal 28, jadi tanggal 29–31 tidak ada user.
 */
@Injectable()
export class InsightsJobService {
  private readonly logger = new Logger(InsightsJobService.name);

  constructor(
    private repository: InsightsRepository,
    private insights: InsightsService,
  ) {}

  @Cron('0 7 * * *', { timeZone: 'Asia/Jakarta' })
  async runDaily(today: Date = getTodayInJakarta()): Promise<{ period: string; generated: number; failed: number }> {
    const startDay = today.getUTCDate();
    if (startDay > 28) return { period: '', generated: 0, failed: 0 };
    const period = shiftMonth(getPeriodKey(toDateString(today), startDay), -1);

    const { start, endExclusive } = getPeriodRange(period, startDay);
    const userIds = await this.repository.findActiveUserIdsWithActivity(start, endExclusive, startDay);

    let generated = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await this.insights.generate(userId, period, { skipQuota: true }); // berurutan, tidak membebani LLM
        generated++;
      } catch (error) {
        failed++;
        this.logger.warn(`Insight ${period} gagal untuk satu user: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    if (userIds.length > 0) this.logger.log(`Insight periode ${period} (mulai tanggal ${startDay}): ${generated} berhasil, ${failed} gagal.`);
    return { period, generated, failed };
  }
}
