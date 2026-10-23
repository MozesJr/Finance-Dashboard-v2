import { Injectable } from '@nestjs/common';
import { SALARY_CATEGORY_ID } from 'shared';
import { PrismaService } from '../../prisma.service';

export interface SalaryRow {
  id: string;
  amount: bigint;
  walletId: string;
  walletName: string;
  date: Date;
}

@Injectable()
export class PaydayRepository {
  constructor(private prisma: PrismaService) {}

  /** Pemasukan CONFIRMED berkategori Gaji dalam rentang tanggal, terbaru dulu. */
  async findSalaries(userId: string, start: Date, endExclusive: Date): Promise<SalaryRow[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, status: 'CONFIRMED', type: 'INCOME', categoryId: SALARY_CATEGORY_ID, date: { gte: start, lt: endExclusive } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, amount: true, walletId: true, date: true, wallet: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, amount: r.amount, walletId: r.walletId, walletName: r.wallet.name, date: r.date }));
  }

  async listActionKeys(userId: string, period: string): Promise<string[]> {
    const rows = await this.prisma.paydayAction.findMany({ where: { userId, period }, select: { itemKey: true } });
    return rows.map((r) => r.itemKey);
  }

  /** true bila baru dicatat; false bila sudah ada (unik per user+periode+item) → dasar idempotensi. */
  async markAction(userId: string, period: string, itemKey: string): Promise<boolean> {
    const { count } = await this.prisma.paydayAction.createMany({ data: [{ userId, period, itemKey }], skipDuplicates: true });
    return count === 1;
  }

  async unmarkAction(userId: string, period: string, itemKey: string): Promise<void> {
    await this.prisma.paydayAction.deleteMany({ where: { userId, period, itemKey } });
  }
}
