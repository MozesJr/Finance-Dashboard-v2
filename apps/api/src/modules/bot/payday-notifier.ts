import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SALARY_CATEGORY_ID } from 'shared';
import { PaydayService } from '../payday/payday.service';
import { PeriodsService } from '../periods/periods.service';
import { TransactionEvents } from '../transactions/transaction-events';
import { BotNotifier } from './bot-notifier';
import { renderChecklist } from './core/handlers/payday.handler';

/** Saat gaji (INCOME kategori Gaji) menjadi CONFIRMED, kirim checklist alokasi ke chat terhubung — sekali per transaksi. */
@Injectable()
export class PaydayNotifier implements OnModuleInit {
  private readonly logger = new Logger(PaydayNotifier.name);

  constructor(
    private events: TransactionEvents,
    private payday: PaydayService,
    private periods: PeriodsService,
    private notifier: BotNotifier,
  ) {}

  onModuleInit(): void {
    this.events.onConfirmed(async (userId, tx) => {
      if (tx.type !== 'INCOME' || tx.categoryId !== SALARY_CATEGORY_ID) return;
      await this.notify(userId, tx.id, tx.date);
    });
  }

  /** Idempoten: pemicu ganda (mis. konfirmasi dua kali) hanya mengirim satu pesan. */
  async notify(userId: string, transactionId: string, date: string): Promise<boolean> {
    const period = await this.periods.forDate(userId, date);
    if (!(await this.payday.claimNotification(userId, period.key, transactionId))) return false;
    const checklist = await this.payday.getChecklist(userId, period.key);
    if (!checklist) return false;
    const sent = await this.notifier.notifyUser(userId, renderChecklist(checklist));
    if (!sent) this.logger.debug('Checklist gajian tidak terkirim (user belum terhubung ke bot).');
    return sent;
  }
}
