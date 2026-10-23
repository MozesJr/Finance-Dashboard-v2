import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
  isDefault: false,
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
      setDefault: jest.fn(),
      findDefault: jest.fn(),
      getInvestmentStats: jest.fn().mockResolvedValue({ capitalDeltas: new Map(), lastAdjusted: new Map() }),
      applyValuation: jest.fn(),
      listAdjustments: jest.fn(),
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

  describe('dompet default', () => {
    it('menjadikan default lewat repository.setDefault (atomik), dompet lain dicabut di sana', async () => {
      repo.findById.mockResolvedValue(wallet('a', 0n) as never);
      repo.getBalanceDeltas.mockResolvedValue(new Map());
      await service.update('u1', 'a', { isDefault: true });
      expect(repo.setDefault).toHaveBeenCalledWith('u1', 'a');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('dompet diarsipkan tidak bisa jadi default (400)', async () => {
      repo.findById.mockResolvedValue(wallet('a', 0n, true) as never);
      await expect(service.update('u1', 'a', { isDefault: true })).rejects.toBeInstanceOf(BadRequestException);
      repo.findById.mockResolvedValue(wallet('b', 0n) as never);
      await expect(service.update('u1', 'b', { isDefault: true, isArchived: true })).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.setDefault).not.toHaveBeenCalled();
    });

    it('mengarsipkan dompet default mencabut status defaultnya', async () => {
      repo.findById.mockResolvedValue({ ...wallet('a', 0n), isDefault: true } as never);
      repo.update.mockResolvedValue(wallet('a', 0n, true) as never);
      repo.getBalanceDeltas.mockResolvedValue(new Map());
      await service.update('u1', 'a', { isArchived: true });
      expect(repo.update).toHaveBeenCalledWith('u1', 'a', { isArchived: true, isDefault: false });
    });

    it('create dengan isDefault memanggil setDefault', async () => {
      repo.create.mockResolvedValue(wallet('a', 0n) as never);
      repo.findById.mockResolvedValue(wallet('a', 0n) as never);
      repo.getBalanceDeltas.mockResolvedValue(new Map());
      await service.create('u1', { name: 'a', type: 'BANK', initialBalance: 0n, isDefault: true });
      expect(repo.setDefault).toHaveBeenCalledWith('u1', 'a');
    });
  });

  describe('investasi', () => {
    const inv = (id: string, initial: bigint, over: Record<string, unknown> = {}) => ({ ...wallet(id, initial), type: 'INVESTMENT', ...over });

    it('dompet INVESTMENT: nilai = saldo, modal = saldo awal + transfer masuk − keluar, untung/rugi dari selisih', async () => {
      repo.findAll.mockResolvedValue([inv('ipot', 1_000_000n)] as never);
      // saldo: transfer masuk 9jt (modal) + penyesuaian −1,3jt → mutasi 7,7jt
      repo.getBalanceDeltas.mockResolvedValue(new Map([['ipot', 7_700_000n]]));
      repo.getInvestmentStats.mockResolvedValue({
        capitalDeltas: new Map([['ipot', 9_000_000n]]),
        lastAdjusted: new Map([['ipot', new Date('2026-10-20T03:00:00Z')]]),
      });
      const [w] = await service.list('u1');
      expect(w.balance).toBe('8700000');
      expect(w.investment).toEqual({ capital: '10000000', unrealized: '-1300000', unrealizedPct: -13, lastAdjustedAt: '2026-10-20T03:00:00.000Z' });
    });

    it('dompet non-INVESTMENT tidak mendapat blok investment dan tidak memicu query statistik', async () => {
      repo.findAll.mockResolvedValue([wallet('a', 1n)] as never);
      repo.getBalanceDeltas.mockResolvedValue(new Map());
      const [w] = await service.list('u1');
      expect(w.investment).toBeUndefined();
      expect(repo.getInvestmentStats).not.toHaveBeenCalled();
    });

    it('setValuation: hanya dompet INVESTMENT aktif; selain itu 400 dan tidak menulis', async () => {
      repo.findById.mockResolvedValue(wallet('a', 0n) as never);
      await expect(service.setValuation('u1', 'a', { value: 5n })).rejects.toBeInstanceOf(BadRequestException);
      repo.findById.mockResolvedValue(inv('b', 0n, { isArchived: true }) as never);
      await expect(service.setValuation('u1', 'b', { value: 5n })).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.applyValuation).not.toHaveBeenCalled();
    });

    it('setValuation membuat penyesuaian dan mengembalikan dompet terbaru; nilai sama → adjustment null', async () => {
      repo.findById.mockResolvedValue(inv('ipot', 0n) as never);
      repo.getBalanceDeltas.mockResolvedValue(new Map([['ipot', 8_700_000n]]));
      repo.applyValuation.mockResolvedValueOnce({ id: 'adj1', amount: -1_300_000n, previousBalance: 10_000_000n });
      const res = await service.setValuation('u1', 'ipot', { value: 8_700_000n, date: '2026-10-22' });
      expect(repo.applyValuation).toHaveBeenCalledWith('u1', 'ipot', 8_700_000n, new Date('2026-10-22T00:00:00Z'), 'Penyesuaian nilai pasar');
      expect(res.adjustment).toMatchObject({ id: 'adj1', amount: '-1300000', date: '2026-10-22' });
      expect(res.wallet.balance).toBe('8700000');

      repo.applyValuation.mockResolvedValueOnce(null);
      expect((await service.setValuation('u1', 'ipot', { value: 8_700_000n })).adjustment).toBeNull();
    });

    it('dompet milik user lain → 404', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.setValuation('u1', 'x', { value: 1n })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('investmentSummary: total nilai, modal, untung/rugi dan persen; mengabaikan non-INVESTMENT', async () => {
      repo.findAll.mockResolvedValue([inv('ipot', 0n), inv('reku', 0n), wallet('bca', 5_000_000n)] as never);
      repo.getBalanceDeltas.mockResolvedValue(new Map([['ipot', 8_700_000n], ['reku', 4_600_000n]]));
      repo.getInvestmentStats.mockResolvedValue({
        capitalDeltas: new Map([['ipot', 10_000_000n], ['reku', 5_000_000n]]),
        lastAdjusted: new Map(),
      });
      const s = await service.investmentSummary('u1');
      expect(s.wallets.map((w) => w.id)).toEqual(['ipot', 'reku']);
      expect(s).toMatchObject({ totalValue: '13300000', totalCapital: '15000000', totalUnrealized: '-1700000', totalUnrealizedPct: -11.33 });
    });
  });
});
