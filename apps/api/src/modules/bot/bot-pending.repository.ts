import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface PendingPayload {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  /** Nominal rupiah (string BigInt). */
  amount: string;
  date: string;
  categoryId: string | null;
  description: string;
}

/** Input ter-parse yang menunggu pilihan dompet (belum bisa jadi draft). */
@Injectable()
export class BotPendingRepository {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, payload: PendingPayload): Promise<string> {
    const row = await this.prisma.botPendingInput.create({
      data: { userId, payload: payload as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    return row.id;
  }

  async find(userId: string, id: string): Promise<PendingPayload | null> {
    const row = await this.prisma.botPendingInput.findFirst({ where: { id, userId } });
    return row ? (row.payload as unknown as PendingPayload) : null;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.botPendingInput.deleteMany({ where: { id, userId } });
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.botPendingInput.deleteMany({ where: { userId } });
    return count;
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.botPendingInput.deleteMany({ where: { createdAt: { lt: before } } });
    return count;
  }
}
