import { Injectable } from '@nestjs/common';
import { Prisma, Wallet } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class WalletsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, includeArchived: boolean): Promise<Wallet[]> {
    return this.prisma.wallet.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(userId: string, id: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.WalletUncheckedCreateInput, 'userId'>): Promise<Wallet> {
    return this.prisma.wallet.create({ data: { ...data, userId } });
  }

  async update(userId: string, id: string, data: Prisma.WalletUpdateInput): Promise<Wallet | null> {
    const { count } = await this.prisma.wallet.updateMany({ where: { id, userId }, data });
    return count === 0 ? null : this.findById(userId, id);
  }

  findDefault(userId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({ where: { userId, isDefault: true, isArchived: false } });
  }

  /** Jadikan satu dompet default dan cabut status default dompet lain (atomik). */
  async setDefault(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.wallet.updateMany({ where: { userId, isDefault: true, NOT: { id } }, data: { isDefault: false } }),
      this.prisma.wallet.updateMany({ where: { userId, id }, data: { isDefault: true } }),
    ]);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.wallet.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  async hasTransactions(userId: string, id: string): Promise<boolean> {
    const count = await this.prisma.transaction.count({
      where: { userId, OR: [{ walletId: id }, { toWalletId: id }] },
    });
    return count > 0;
  }

  /**
   * Mutasi bersih (tanpa initialBalance) per wallet milik user, dihitung satu query di DB.
   * Hanya CONFIRMED: income +, expense −, transfer keluar −, transfer masuk +.
   */
  async getBalanceDeltas(userId: string): Promise<Map<string, bigint>> {
    const rows = await this.prisma.$queryRaw<Array<{ wallet_id: string; delta: bigint }>>`
      SELECT wid AS wallet_id, SUM(delta)::bigint AS delta
      FROM (
        SELECT wallet_id AS wid,
               CASE type WHEN 'INCOME' THEN amount ELSE -amount END AS delta
        FROM transactions
        WHERE user_id = ${userId} AND status = 'CONFIRMED'
        UNION ALL
        SELECT to_wallet_id AS wid, amount AS delta
        FROM transactions
        WHERE user_id = ${userId} AND status = 'CONFIRMED'
          AND type = 'TRANSFER' AND to_wallet_id IS NOT NULL
      ) mutations
      GROUP BY wid
    `;
    return new Map(rows.map((r) => [r.wallet_id, r.delta]));
  }
}
