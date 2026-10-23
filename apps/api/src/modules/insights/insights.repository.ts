import { Injectable } from '@nestjs/common';
import { AiInsight, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export const MONTHLY_KIND = 'MONTHLY';

@Injectable()
export class InsightsRepository {
  constructor(private prisma: PrismaService) {}

  find(userId: string, period: string): Promise<AiInsight | null> {
    return this.prisma.aiInsight.findUnique({ where: { userId_period_kind: { userId, period, kind: MONTHLY_KIND } } });
  }

  upsert(userId: string, period: string, content: Prisma.InputJsonValue, generatedAt: Date): Promise<AiInsight> {
    return this.prisma.aiInsight.upsert({
      where: { userId_period_kind: { userId, period, kind: MONTHLY_KIND } },
      create: { userId, period, kind: MONTHLY_KIND, content, generatedAt },
      update: { content, generatedAt },
    });
  }

  /** User ACTIVE dengan tanggal mulai periode tertentu yang punya transaksi CONFIRMED dalam rentang (job harian). */
  async findActiveUserIdsWithActivity(start: Date, endExclusive: Date, periodStartDay: number): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', periodStartDay, transactions: { some: { status: 'CONFIRMED', date: { gte: start, lt: endExclusive } } } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return users.map((u) => u.id);
  }
}
