import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

/** Ekspresi SQL kunci periode (YYYY-MM) untuk kolom transactions.date: bulan tempat periode berakhir. */
export function periodKeySql(startDay: number): Prisma.Sql {
  return Prisma.sql`to_char(CASE WHEN ${startDay}::int > 1 AND EXTRACT(DAY FROM date) >= ${startDay}::int THEN date + INTERVAL '1 month' ELSE date END, 'YYYY-MM')`;
}

@Injectable()
export class PeriodsRepository {
  constructor(private prisma: PrismaService) {}

  async getStartDay(userId: string): Promise<number | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { periodStartDay: true } });
    return row?.periodStartDay ?? null;
  }

  /**
   * Ubah tanggal mulai periode dan hapus cache insight user itu dalam satu transaksi
   * (isi cache dihitung dengan rentang lama). Transaksi keuangan tidak disentuh.
   */
  async setStartDay(userId: string, startDay: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { periodStartDay: startDay } }),
      this.prisma.aiInsight.deleteMany({ where: { userId } }),
    ]);
  }
}
