import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TxSource, TxStatus } from '@prisma/client';
import { checkTransactionShape, getTodayInJakarta } from 'shared';
import { WalletsService } from '../wallets/wallets.service';
import { CategoriesService } from '../categories/categories.service';
import {
  TransactionCursor,
  TransactionsRepository,
  TransactionWithRelations,
  TransactionWriteData,
} from './transactions.repository';
import { CreateTransactionInput, TransactionListQuery, UpdateTransactionInput } from './dto/transaction.dto';

export interface TransactionResponse {
  id: string;
  type: string;
  amount: string;
  status: string;
  date: string;
  merchant: string | null;
  note: string | null;
  source: string;
  receiptId: string | null;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
  wallet: { id: string; name: string; color: string | null };
  toWallet: { id: string; name: string; color: string | null } | null;
  category: { id: string; name: string; color: string | null; icon: string | null } | null;
  createdAt: Date;
}

export interface TransactionPage {
  items: TransactionResponse[];
  nextCursor: string | null;
}

export interface CreateOptions {
  source?: TxSource;
  status?: TxStatus;
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

export function encodeCursor(row: { date: Date; createdAt: Date; id: string }): string {
  const raw = `${row.date.toISOString().slice(0, 10)}|${row.createdAt.toISOString()}|${row.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): TransactionCursor {
  const [date, createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAtDate = new Date(createdAt ?? '');
  if (!date || !id || Number.isNaN(createdAtDate.getTime()) || Number.isNaN(toDate(date).getTime())) {
    throw new BadRequestException('Cursor tidak valid');
  }
  return { date: toDate(date), createdAt: createdAtDate, id };
}

@Injectable()
export class TransactionsService {
  constructor(
    private repository: TransactionsRepository,
    private wallets: WalletsService,
    private categories: CategoriesService,
  ) {}

  async list(userId: string, query: TransactionListQuery): Promise<TransactionPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await this.repository.findPage(
      userId,
      {
        dateFrom: query.dateFrom ? toDate(query.dateFrom) : undefined,
        dateTo: query.dateTo ? toDate(query.dateTo) : undefined,
        type: query.type,
        walletId: query.walletId,
        categoryId: query.categoryId,
        q: query.q,
      },
      cursor,
      query.limit + 1,
    );
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: pageRows.map(toResponse),
      nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null,
    };
  }

  async get(userId: string, id: string): Promise<TransactionResponse> {
    return toResponse(await this.getOwned(userId, id));
  }

  async create(userId: string, input: CreateTransactionInput, options: CreateOptions = {}): Promise<TransactionResponse> {
    const data: TransactionWriteData = {
      type: input.type,
      walletId: input.walletId,
      toWalletId: input.toWalletId ?? null,
      categoryId: input.categoryId ?? null,
      amount: input.amount,
      date: input.date ? toDate(input.date) : getTodayInJakarta(),
      merchant: input.merchant ?? null,
      note: input.note ?? null,
    };
    await this.validate(userId, data);
    const created = await this.repository.create(userId, {
      ...data,
      source: options.source ?? 'WEB',
      status: options.status ?? 'CONFIRMED',
    });
    return toResponse(created);
  }

  async update(userId: string, id: string, input: UpdateTransactionInput): Promise<TransactionResponse> {
    const existing = await this.getOwned(userId, id);
    await this.assertNotSavingsTransfer(userId, id);
    const merged: TransactionWriteData = {
      type: input.type ?? existing.type,
      walletId: input.walletId ?? existing.walletId,
      toWalletId: input.toWalletId !== undefined ? input.toWalletId : existing.toWalletId,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      amount: input.amount ?? existing.amount,
      date: input.date ? toDate(input.date) : existing.date,
      merchant: input.merchant !== undefined ? input.merchant : existing.merchant,
      note: input.note !== undefined ? input.note : existing.note,
    };
    await this.validate(userId, merged, existing);
    await this.repository.update(userId, id, merged);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.assertNotSavingsTransfer(userId, id);
    await this.repository.delete(userId, id);
  }

  private async assertNotSavingsTransfer(userId: string, id: string): Promise<void> {
    if (await this.repository.hasSavingsContribution(userId, id)) {
      throw new ConflictException('Transaksi ini dibuat dari kontribusi tabungan. Ubah atau hapus lewat halaman Tabungan.');
    }
  }

  private async getOwned(userId: string, id: string): Promise<TransactionWithRelations> {
    const tx = await this.repository.findById(userId, id);
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan');
    return tx;
  }

  /**
   * Bentuk transaksi + kepemilikan wallet/kategori (404 jika milik user lain) +
   * kecocokan tipe kategori. Wallet yang diarsipkan tidak boleh dipakai baru
   * (kecuali transaksi lama yang tetap memakai wallet yang sama saat update).
   */
  private async validate(
    userId: string,
    data: TransactionWriteData,
    existing?: { walletId: string; toWalletId: string | null },
  ): Promise<void> {
    const problem = checkTransactionShape(data);
    if (problem) throw new BadRequestException(problem.message);
    if (data.amount <= 0n) throw new BadRequestException('Nominal harus lebih dari 0');

    const walletIds = [data.walletId, ...(data.toWalletId ? [data.toWalletId] : [])];
    for (const walletId of walletIds) {
      const wallet = await this.wallets.getOwned(userId, walletId);
      const unchanged = existing && (walletId === existing.walletId || walletId === existing.toWalletId);
      if (wallet.isArchived && !unchanged) {
        throw new BadRequestException(`Wallet "${wallet.name}" sudah diarsipkan`);
      }
    }

    if (data.categoryId) {
      const category = await this.categories.getVisible(userId, data.categoryId);
      if (category.type !== data.type) {
        throw new BadRequestException('Tipe kategori tidak cocok dengan tipe transaksi');
      }
    }
  }
}

function toResponse(tx: TransactionWithRelations): TransactionResponse {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount.toString(),
    status: tx.status,
    date: tx.date.toISOString().slice(0, 10),
    merchant: tx.merchant,
    note: tx.note,
    source: tx.source,
    receiptId: tx.receiptId,
    walletId: tx.walletId,
    toWalletId: tx.toWalletId,
    categoryId: tx.categoryId,
    wallet: tx.wallet,
    toWallet: tx.toWallet,
    category: tx.category,
    createdAt: tx.createdAt,
  };
}
