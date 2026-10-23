import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

/**
 * Tabel turunan "bagian periode" untuk laporan: setiap transaksi CONFIRMED INCOME/EXPENSE milik user dipecah menjadi
 * `spread_periods` baris (satu per periode berturut-turut, mulai periode tanggal transaksi). Nominal dibagi rata
 * (bigint, tanpa float); sisa pembulatan masuk ke periode pertama. Kolom: id, category_id, type, date, period_key, share.
 * Pemakaian: FROM ${sharesSql(userId, startDay)} s WHERE s.period_key BETWEEN $a AND $b.
 * Saldo dompet TIDAK memakai ini (selalu nominal penuh di tanggal transaksi).
 */
export function sharesSql(userId: string, startDay: number): Prisma.Sql {
  return Prisma.sql`(
    SELECT t.id, t.category_id, t.type::text AS type, t.date,
      to_char(date_trunc('month',
        (CASE WHEN ${startDay}::int > 1 AND EXTRACT(DAY FROM t.date) >= ${startDay}::int THEN t.date + INTERVAL '1 month' ELSE t.date::timestamp END)
        + k * INTERVAL '1 month'), 'YYYY-MM') AS period_key,
      CASE WHEN k = 0 THEN t.amount - (t.amount / t.spread_periods) * (t.spread_periods - 1) ELSE t.amount / t.spread_periods END AS share
    FROM transactions t
    CROSS JOIN LATERAL generate_series(0, t.spread_periods - 1) AS k
    WHERE t.user_id = ${userId} AND t.status = 'CONFIRMED' AND t.type IN ('INCOME', 'EXPENSE')
  )`;
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
