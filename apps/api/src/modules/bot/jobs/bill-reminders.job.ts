import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getTodayInJakarta } from 'shared';
import { BillsService } from '../../bills/bills.service';
import { BotNotifier } from '../bot-notifier';
import { renderReminder } from '../core/handlers/bills.handler';

/**
 * Setiap hari 08:00 Asia/Jakarta: pengingat jatuh tempo (H-7 dan H-1 secara default, per tagihan) dan pengingat yang ditunda.
 * Idempoten: setiap pengingat diklaim unik (tagihan + jatuh tempo + hari-sebelum) sebelum dikirim; gagal kirim → klaim dilepas.
 */
@Injectable()
export class BillRemindersJob {
  private readonly logger = new Logger(BillRemindersJob.name);

  constructor(
    private bills: BillsService,
    private notifier: BotNotifier,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'Asia/Jakarta' })
  async run(today: Date = getTodayInJakarta()): Promise<{ sent: number; skipped: number; failed: number }> {
    const due = await this.bills.dueReminders(today);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const r of due) {
      try {
        if (!(await this.bills.claimReminder(r.bill, r.daysBefore))) {
          skipped++;
          continue;
        }
        const view = await this.bills.describe(r.bill);
        const delivered = await this.notifier.notifyUser(r.bill.userId, renderReminder(view, r.daysLeft, r.snoozed));
        if (!delivered) {
          await this.bills.releaseReminder(r.bill, r.daysBefore);
          failed++;
          continue;
        }
        if (r.snoozed) await this.bills.clearSnooze(r.bill);
        sent++;
      } catch (error) {
        failed++;
        this.logger.warn(`Pengingat tagihan gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    if (due.length > 0) this.logger.log(`Pengingat tagihan: ${sent} terkirim, ${skipped} sudah pernah, ${failed} gagal.`);
    return { sent, skipped, failed };
  }
}
