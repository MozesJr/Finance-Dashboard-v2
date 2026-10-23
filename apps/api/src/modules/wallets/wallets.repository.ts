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
   * Hanya CONFIRMED: income +, expense −, transfer keluar −, transfer masuk +,
   * penyesuaian nilai (ADJUSTMENT) + (amount-nya sudah bertanda ±).
   */
  async getBalanceDeltas(userId: string): Promise<Map<string, bigint>> {
    const rows = await this.prisma.$queryRaw<Array<{ wallet_id: string; delta: bigint }>>`
      SELECT wid AS wallet_id, SUM(delta)::bigint AS delta
      FROM (
        SELECT wallet_id AS wid,
               CASE type WHEN 'EXPENSE' THEN -amount WHEN 'TRANSFER' THEN -amount ELSE amount END AS delta
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

  /**
   * Statistik dompet INVESTMENT: mutasi modal (transfer masuk − transfer keluar, tanpa ADJUSTMENT dan
   * tanpa income/expense) dan waktu penyesuaian nilai terakhir. Satu query per jenis, hanya CONFIRMED.
   */
  async getInvestmentStats(userId: string): Promise<{ capitalDeltas: Map<string, bigint>; lastAdjusted: Map<string, Date> }> {
    const [capital, adjusted] = await Promise.all([
      this.prisma.$queryRaw<Array<{ wallet_id: string; delta: bigint }>>`
        SELECT wid AS wallet_id, SUM(delta)::bigint AS delta
        FROM (
          SELECT wallet_id AS wid, -amount AS delta
          FROM transactions
          WHERE user_id = ${userId} AND status = 'CONFIRMED' AND type = 'TRANSFER'
          UNION ALL
          SELECT to_wallet_id AS wid, amount AS delta
          FROM transactions
          WHERE user_id = ${userId} AND status = 'CONFIRMED' AND type = 'TRANSFER' AND to_wallet_id IS NOT NULL
        ) t
        GROUP BY wid
      `,
      this.prisma.$queryRaw<Array<{ wallet_id: string; last_at: Date }>>`
        SELECT wallet_id, MAX(created_at) AS last_at
        FROM transactions
        WHERE user_id = ${userId} AND status = 'CONFIRMED' AND type = 'ADJUSTMENT'
        GROUP BY wallet_id
      `,
    ]);
    return {
      capitalDeltas: new Map(capital.map((r) => [r.wallet_id, r.delta])),
      lastAdjusted: new Map(adjusted.map((r) => [r.wallet_id, r.last_at])),
    };
  }

  /**
   * Atomik: kunci baris dompet, hitung saldo saat ini, buat transaksi ADJUSTMENT sebesar selisih.
   * Mengembalikan null bila nilai baru sama dengan saldo (tidak ada yang dibuat).
   */
  applyValuation(
    userId: string,
    walletId: string,
    newValue: bigint,
    date: Date,
    note: string,
  ): Promise<{ id: string; amount: bigint; previousBalance: bigint } | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId} AND user_id = ${userId} FOR UPDATE`;
      const rows = await tx.$queryRaw<Array<{ balance: bigint }>>`
        SELECT (w.initial_balance + COALESCE((
          SELECT SUM(CASE
            WHEN t.wallet_id = w.id AND t.type IN ('EXPENSE', 'TRANSFER') THEN -t.amount
            WHEN t.wallet_id = w.id THEN t.amount
            ELSE t.amount END)
          FROM transactions t
          WHERE t.user_id = ${userId} AND t.status = 'CONFIRMED'
            AND (t.wallet_id = w.id OR (t.to_wallet_id = w.id AND t.type = 'TRANSFER'))
        ), 0))::bigint AS balance
        FROM wallets w WHERE w.id = ${walletId} AND w.user_id = ${userId}
      `;
      const previousBalance = rows[0]?.balance ?? 0n;
      const delta = newValue - previousBalance;
      if (delta === 0n) return null;
      const created = await tx.transaction.create({
        data: { userId, walletId, type: 'ADJUSTMENT', amount: delta, date, note, source: 'WEB', status: 'CONFIRMED' },
        select: { id: true, amount: true },
      });
      return { id: created.id, amount: created.amount, previousBalance };
    });
  }

  listAdjustments(userId: string, walletId: string, limit: number) {
    return this.prisma.transaction.findMany({
      where: { userId, walletId, type: 'ADJUSTMENT', status: 'CONFIRMED' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: { id: true, amount: true, date: true, createdAt: true, note: true },
    });
  }
}
