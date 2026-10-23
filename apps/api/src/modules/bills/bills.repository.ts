import { Injectable } from '@nestjs/common';
import { Bill, BillPayment, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type BillRow = Bill;

export interface SettleInput {
  transactionId: string;
  amount: bigint;
  /** Jatuh tempo yang dibayar (nextDueDate sebelum maju). */
  dueDate: Date;
  paidOn: Date;
  nextDueDate: Date;
  /** Bila diisi, nominal tagihan diperbarui. */
  newAmount?: bigint;
}

@Injectable()
export class BillsRepository {
  constructor(private prisma: PrismaService) {}

  list(userId: string, includeInactive: boolean): Promise<Bill[]> {
    return this.prisma.bill.findMany({
      where: { userId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }, { name: 'asc' }],
    });
  }

  findById(userId: string, id: string): Promise<Bill | null> {
    return this.prisma.bill.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.BillUncheckedCreateInput, 'userId'>): Promise<Bill> {
    return this.prisma.bill.create({ data: { ...data, userId } });
  }

  async update(userId: string, id: string, data: Prisma.BillUncheckedUpdateManyInput): Promise<Bill | null> {
    const { count } = await this.prisma.bill.updateMany({ where: { id, userId }, data });
    return count === 0 ? null : this.findById(userId, id);
  }

  /** Pembayaran terakhir per tagihan (untuk menghitung cadangan). */
  async lastPaidOn(userId: string): Promise<Map<string, Date>> {
    const rows = await this.prisma.billPayment.groupBy({ by: ['billId'], where: { userId }, _max: { paidOn: true } });
    return new Map(rows.flatMap((r) => (r._max.paidOn ? [[r.billId, r._max.paidOn] as [string, Date]] : [])));
  }

  payments(userId: string, billId: string, limit: number): Promise<BillPayment[]> {
    return this.prisma.billPayment.findMany({ where: { userId, billId }, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], take: limit });
  }

  /** Pembayaran dengan jatuh tempo dalam rentang (untuk menandai "sudah" di checklist gajian). */
  paymentsDueIn(userId: string, start: Date, endExclusive: Date): Promise<BillPayment[]> {
    return this.prisma.billPayment.findMany({ where: { userId, dueDate: { gte: start, lt: endExclusive } } });
  }

  /**
   * Atomik & idempoten: catat pembayaran (transaction_id unik) dan majukan jatuh tempo hanya bila pembayaran ini baru
   * dan jatuh tempo bill masih sama dengan yang dibayar. Mengembalikan true bila pembayaran baru tercatat.
   */
  async settle(userId: string, billId: string, input: SettleInput): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.billPayment.createMany({
        data: [{ billId, userId, transactionId: input.transactionId, amount: input.amount, dueDate: input.dueDate, paidOn: input.paidOn }],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      await tx.bill.updateMany({
        where: { id: billId, userId, nextDueDate: input.dueDate },
        data: { nextDueDate: input.nextDueDate, snoozedUntil: null, ...(input.newAmount !== undefined ? { amount: input.newAmount } : {}) },
      });
      return true;
    });
  }

  /** Tagihan aktif milik user ACTIVE yang jatuh tempo dalam rentang (untuk job pengingat, semua user). */
  findRemindable(start: Date, endExclusive: Date): Promise<Bill[]> {
    return this.prisma.bill.findMany({
      where: { isActive: true, user: { status: 'ACTIVE' }, nextDueDate: { gte: start, lt: endExclusive } },
      orderBy: [{ userId: 'asc' }, { nextDueDate: 'asc' }],
    });
  }

  findSnoozedFor(day: Date): Promise<Bill[]> {
    return this.prisma.bill.findMany({ where: { isActive: true, user: { status: 'ACTIVE' }, snoozedUntil: day } });
  }

  /** true bila pengingat ini baru diklaim (unik per bill+jatuh tempo+hari-sebelum). */
  async claimReminder(billId: string, dueDate: Date, daysBefore: number): Promise<boolean> {
    const { count } = await this.prisma.billReminder.createMany({ data: [{ billId, dueDate, daysBefore }], skipDuplicates: true });
    return count === 1;
  }

  async releaseReminder(billId: string, dueDate: Date, daysBefore: number): Promise<void> {
    await this.prisma.billReminder.deleteMany({ where: { billId, dueDate, daysBefore } });
  }
}
