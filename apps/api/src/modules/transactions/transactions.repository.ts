import { Injectable } from '@nestjs/common';
import { Prisma, TxSource, TxStatus, TxType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

const TX_INCLUDE = {
  wallet: { select: { id: true, name: true, color: true } },
  toWallet: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof TX_INCLUDE }>;

export interface TransactionFilters {
  dateFrom?: Date;
  dateTo?: Date;
  type?: TxType;
  walletId?: string;
  categoryId?: string;
  q?: string;
}

export interface TransactionCursor {
  date: Date;
  createdAt: Date;
  id: string;
}

export interface TransactionWriteData {
  type: TxType;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
  amount: bigint;
  date: Date;
  merchant: string | null;
  note: string | null;
}

@Injectable()
export class TransactionsRepository {
  constructor(private prisma: PrismaService) {}

  /** Urut date desc, createdAt desc, id desc; keyset pagination. Mengambil limit+1 baris. */
  findPage(
    userId: string,
    filters: TransactionFilters,
    cursor: TransactionCursor | undefined,
    take: number,
  ): Promise<TransactionWithRelations[]> {
    const and: Prisma.TransactionWhereInput[] = [];
    if (filters.q) {
      and.push({
        OR: [
          { merchant: { contains: filters.q, mode: 'insensitive' } },
          { note: { contains: filters.q, mode: 'insensitive' } },
        ],
      });
    }
    if (cursor) {
      and.push({
        OR: [
          { date: { lt: cursor.date } },
          { date: cursor.date, createdAt: { lt: cursor.createdAt } },
          { date: cursor.date, createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    return this.prisma.transaction.findMany({
      where: {
        userId,
        status: 'CONFIRMED',
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.walletId ? { OR: [{ walletId: filters.walletId }, { toWalletId: filters.walletId }] } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? { date: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
        ...(and.length ? { AND: and } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: TX_INCLUDE,
    });
  }

  findById(userId: string, id: string): Promise<TransactionWithRelations | null> {
    return this.prisma.transaction.findFirst({ where: { id, userId }, include: TX_INCLUDE });
  }

  async create(
    userId: string,
    data: TransactionWriteData & { source: TxSource; status: TxStatus },
  ): Promise<TransactionWithRelations> {
    return this.prisma.transaction.create({ data: { ...data, userId }, include: TX_INCLUDE });
  }

  async update(userId: string, id: string, data: TransactionWriteData): Promise<void> {
    await this.prisma.transaction.updateMany({ where: { id, userId }, data });
  }

  /** Transfer yang dibuat dari kontribusi tabungan (dikelola dari halaman Tabungan). */
  async hasSavingsContribution(userId: string, id: string): Promise<boolean> {
    const count = await this.prisma.savingsContribution.count({ where: { userId, transactionId: id } });
    return count > 0;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.transaction.deleteMany({ where: { id, userId } });
  }
}
