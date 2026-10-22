import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateTransactionSchema } from 'shared';
import { decodeCursor, encodeCursor, TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';
import { WalletsService } from '../wallets/wallets.service';
import { CategoriesService } from '../categories/categories.service';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-20T03:00:00.000Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  userId: 'u1',
  type: 'EXPENSE',
  amount: 35000n,
  status: 'CONFIRMED',
  date: new Date('2026-10-20T00:00:00Z'),
  merchant: null,
  note: null,
  source: 'WEB',
  receiptId: null,
  walletId: W1,
  toWalletId: null,
  categoryId: 'cat-expense-makan',
  wallet: { id: W1, name: 'Tunai', color: null },
  toWallet: null,
  category: { id: 'cat-expense-makan', name: 'Makan', color: null, icon: null },
  createdAt: now,
  ...over,
});

describe('TransactionsService', () => {
  let repo: jest.Mocked<TransactionsRepository>;
  let wallets: jest.Mocked<WalletsService>;
  let categories: jest.Mocked<CategoriesService>;
  let service: TransactionsService;

  beforeEach(() => {
    repo = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      hasSavingsContribution: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<TransactionsRepository>;
    wallets = { getOwned: jest.fn() } as unknown as jest.Mocked<WalletsService>;
    categories = { getVisible: jest.fn() } as unknown as jest.Mocked<CategoriesService>;
    wallets.getOwned.mockImplementation(async (_u, id) => ({ id, name: id, isArchived: false }) as never);
    categories.getVisible.mockResolvedValue({ id: 'cat-expense-makan', type: 'EXPENSE' } as never);
    service = new TransactionsService(repo, wallets, categories);
  });

  const parse = (input: unknown) => CreateTransactionSchema.parse(input);

  it('create: default source WEB, status CONFIRMED, tanggal hari ini, amount string di response', async () => {
    repo.create.mockResolvedValue(row() as never);
    const res = await service.create('u1', parse({ type: 'EXPENSE', walletId: W1, categoryId: 'cat-expense-makan', amount: '35rb' }));
    const arg = repo.create.mock.calls[0][1];
    expect(arg).toMatchObject({ source: 'WEB', status: 'CONFIRMED', amount: 35000n, type: 'EXPENSE' });
    expect(arg.date.getUTCHours()).toBe(0);
    expect(res.amount).toBe('35000');
    expect(res).not.toHaveProperty('userId');
  });

  it('create: tipe kategori tidak cocok → 400', async () => {
    categories.getVisible.mockResolvedValue({ id: 'cat-income-gaji', type: 'INCOME' } as never);
    await expect(
      service.create('u1', parse({ type: 'EXPENSE', walletId: W1, categoryId: 'cat-income-gaji', amount: 1000 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create: transfer ke wallet yang sama ditolak di service (lapis kedua)', async () => {
    const bad = { type: 'TRANSFER', walletId: W1, toWalletId: W1, categoryId: null, amount: 1000n, date: undefined } as never;
    await expect(service.create('u1', bad)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create: transfer valid tanpa kategori', async () => {
    repo.create.mockResolvedValue(row({ type: 'TRANSFER', toWalletId: W2, categoryId: null, category: null }) as never);
    await service.create('u1', parse({ type: 'TRANSFER', walletId: W1, toWalletId: W2, amount: 100000 }));
    expect(categories.getVisible).not.toHaveBeenCalled();
    expect(wallets.getOwned).toHaveBeenCalledTimes(2);
  });

  it('isolasi user: wallet/kategori milik user lain → 404 dan tidak ada yang tersimpan', async () => {
    wallets.getOwned.mockRejectedValue(new NotFoundException('Wallet tidak ditemukan'));
    await expect(
      service.create('u1', parse({ type: 'EXPENSE', walletId: W1, categoryId: 'cat-expense-makan', amount: 1000 })),
    ).rejects.toBeInstanceOf(NotFoundException);

    wallets.getOwned.mockImplementation(async (_u, id) => ({ id, name: id, isArchived: false }) as never);
    categories.getVisible.mockRejectedValue(new NotFoundException('Kategori tidak ditemukan'));
    await expect(
      service.create('u1', parse({ type: 'EXPENSE', walletId: W1, categoryId: 'orang-lain', amount: 1000 })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('wallet diarsipkan tidak bisa dipakai transaksi baru', async () => {
    wallets.getOwned.mockResolvedValue({ id: W1, name: 'Lama', isArchived: true } as never);
    await expect(
      service.create('u1', parse({ type: 'EXPENSE', walletId: W1, categoryId: 'cat-expense-makan', amount: 1000 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('get/update/remove transaksi user lain → 404, repository selalu diberi userId', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('u1', 'x', { note: 'a' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findById).toHaveBeenCalledWith('u1', 'x');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('update: gabungan dengan data lama divalidasi ulang (ubah ke TRANSFER tanpa toWalletId → 400)', async () => {
    repo.findById.mockResolvedValue(row() as never);
    await expect(service.update('u1', 't1', { type: 'TRANSFER', categoryId: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('transfer hasil kontribusi tabungan tidak bisa diubah/dihapus dari transaksi (409)', async () => {
    repo.findById.mockResolvedValue(row({ type: 'TRANSFER', toWalletId: W2, categoryId: null }) as never);
    repo.hasSavingsContribution.mockResolvedValue(true);
    await expect(service.update('u1', 't1', { note: 'x' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('u1', 't1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('list: limit+1 diminta, nextCursor terisi bila ada halaman berikut', async () => {
    const rows = [row({ id: 'c' }), row({ id: 'b' }), row({ id: 'a' })];
    repo.findPage.mockResolvedValue(rows as never);
    const page = await service.list('u1', { limit: 2 } as never);
    expect(repo.findPage).toHaveBeenCalledWith('u1', expect.any(Object), undefined, 3);
    expect(page.items.map((i) => i.id)).toEqual(['c', 'b']);
    expect(decodeCursor(page.nextCursor as string).id).toBe('b');

    repo.findPage.mockResolvedValue(rows.slice(0, 2) as never);
    expect((await service.list('u1', { limit: 2 } as never)).nextCursor).toBeNull();
  });

  it('cursor round-trip & cursor rusak → 400', () => {
    const c = encodeCursor({ date: new Date('2026-10-20T00:00:00Z'), createdAt: now, id: 't9' });
    expect(decodeCursor(c)).toEqual({ date: new Date('2026-10-20T00:00:00Z'), createdAt: now, id: 't9' });
    expect(() => decodeCursor('@@@')).toThrow(BadRequestException);
  });
});
