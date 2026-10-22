import { ConflictException, NotFoundException } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';

const now = new Date('2026-10-01T00:00:00Z');
const wallet = (id: string, initialBalance: bigint, isArchived = false) => ({
  id,
  userId: 'u1',
  name: id,
  type: 'BANK',
  color: null,
  isArchived,
  initialBalance,
  createdAt: now,
  updatedAt: now,
});

describe('WalletsService', () => {
  let repo: jest.Mocked<WalletsRepository>;
  let service: WalletsService;

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      hasTransactions: jest.fn(),
      getBalanceDeltas: jest.fn(),
    } as unknown as jest.Mocked<WalletsRepository>;
    service = new WalletsService(repo);
  });

  it('balance = initialBalance + mutasi bersih (income − expense − transfer keluar + transfer masuk)', async () => {
    repo.findAll.mockResolvedValue([wallet('a', 1_000_000n), wallet('b', 0n), wallet('c', 500n)] as never);
    // a: +2.000.000 income −350.000 expense −500.000 transfer keluar = 1.150.000
    // b: +500.000 transfer masuk
    // c: tanpa mutasi
    repo.getBalanceDeltas.mockResolvedValue(new Map([['a', 1_150_000n], ['b', 500_000n]]));

    const result = await service.list('u1');

    expect(result.map((w) => [w.id, w.balance])).toEqual([
      ['a', '2150000'],
      ['b', '500000'],
      ['c', '500'],
    ]);
    expect(repo.getBalanceDeltas).toHaveBeenCalledWith('u1');
    expect(repo.findAll).toHaveBeenCalledWith('u1', false);
  });

  it('balance bisa negatif dan tetap string', async () => {
    repo.findById.mockResolvedValue(wallet('a', 100n) as never);
    repo.getBalanceDeltas.mockResolvedValue(new Map([['a', -400n]]));
    expect((await service.get('u1', 'a')).balance).toBe('-300');
  });

  it('wallet milik user lain / tidak ada → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('u1', 'x', { name: 'n' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findById).toHaveBeenCalledWith('u1', 'x');
  });

  it('wallet yang punya transaksi tidak bisa dihapus (409)', async () => {
    repo.findById.mockResolvedValue(wallet('a', 0n) as never);
    repo.hasTransactions.mockResolvedValue(true);
    await expect(service.remove('u1', 'a')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('wallet tanpa transaksi bisa dihapus', async () => {
    repo.findById.mockResolvedValue(wallet('a', 0n) as never);
    repo.hasTransactions.mockResolvedValue(false);
    await service.remove('u1', 'a');
    expect(repo.delete).toHaveBeenCalledWith('u1', 'a');
  });

  it('response tidak memuat userId', async () => {
    repo.create.mockResolvedValue(wallet('a', 0n) as never);
    const res = await service.create('u1', { name: 'a', type: 'BANK', initialBalance: 0n });
    expect(res).not.toHaveProperty('userId');
  });
});
