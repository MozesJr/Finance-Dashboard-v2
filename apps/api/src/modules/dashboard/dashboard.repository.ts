import { Injectable } from '@nestjs/common';
import { CategoryType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface CategoryTotal {
  categoryId: string | null;
  total: bigint;
  count: number;
}

export interface CategoryInfo {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface MonthlyTotal {
  month: string; // YYYY-MM
  type: 'INCOME' | 'EXPENSE';
  total: bigint;
}

/** Semua agregasi: hanya CONFIRMED, hanya INCOME/EXPENSE (TRANSFER tidak dihitung), difilter userId. */
@Injectable()
export class DashboardRepository {
  constructor(private prisma: PrismaService) {}

  async sumByType(userId: string, start: Date, endExclusive: Date): Promise<{ income: bigint; expense: bigint }> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        userId,
        status: 'CONFIRMED',
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: start, lt: endExclusive },
      },
      _sum: { amount: true },
    });
    const sum = (type: string) => groups.find((g) => g.type === type)?._sum.amount ?? 0n;
    return { income: sum('INCOME'), expense: sum('EXPENSE') };
  }

  async totalsByCategory(
    userId: string,
    type: CategoryType,
    start: Date,
    endExclusive: Date,
  ): Promise<CategoryTotal[]> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, status: 'CONFIRMED', type, date: { gte: start, lt: endExclusive } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return groups.map((g) => ({
      categoryId: g.categoryId,
      total: g._sum.amount ?? 0n,
      count: g._count._all,
    }));
  }

  findCategories(ids: string[]): Promise<CategoryInfo[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, color: true, icon: true },
    });
  }

  /** Total per bulan & tipe. Bulan tanpa transaksi tidak muncul (diisi 0 di service). */
  async monthlyTotals(userId: string, start: Date, endExclusive: Date): Promise<MonthlyTotal[]> {
    const rows = await this.prisma.$queryRaw<Array<{ month: string; type: 'INCOME' | 'EXPENSE'; total: bigint }>>`
      SELECT to_char(date, 'YYYY-MM') AS month, type::text AS type, SUM(amount)::bigint AS total
      FROM transactions
      WHERE user_id = ${userId}
        AND status = 'CONFIRMED'
        AND type IN ('INCOME', 'EXPENSE')
        AND date >= ${start}::date
        AND date < ${endExclusive}::date
      GROUP BY 1, 2
    `;
    return rows;
  }
}
