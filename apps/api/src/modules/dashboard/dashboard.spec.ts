import { DashboardService, percentChange, percentOf } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { WalletsService } from '../wallets/wallets.service';

describe('percent helpers', () => {
  it('percentOf / percentChange tanpa float nominal', () => {
    expect(percentOf(1n, 3n)).toBe(33.3);
    expect(percentOf(2n, 3n)).toBe(66.7);
    expect(percentOf(1200000n, 1235000n) + percentOf(35000n, 1235000n)).toBe(100);
    expect(percentOf(5n, 0n)).toBe(0);
    expect(percentChange(150n, 100n)).toBe(50);
    expect(percentChange(50n, 100n)).toBe(-50);
    expect(percentChange(10n, 0n)).toBeNull();
    expect(percentChange(-50n, -100n)).toBe(50); // rugi mengecil = membaik
  });
});

describe('DashboardService', () => {
  let repo: jest.Mocked<DashboardRepository>;
  let wallets: jest.Mocked<WalletsService>;
  let service: DashboardService;

  beforeEach(() => {
    repo = {
      sumByType: jest.fn(),
      totalsByCategory: jest.fn(),
      findCategories: jest.fn(),
      monthlyTotals: jest.fn(),
    } as unknown as jest.Mocked<DashboardRepository>;
    wallets = { list: jest.fn() } as unknown as jest.Mocked<WalletsService>;
    service = new DashboardService(repo, wallets);
  });

  it('summary: net, perubahan vs bulan lalu, totalBalance dari wallet aktif, semua string', async () => {
    repo.sumByType
      .mockResolvedValueOnce({ income: 5_000_000n, expense: 2_000_000n }) // 2026-10
      .mockResolvedValueOnce({ income: 4_000_000n, expense: 2_500_000n }); // 2026-09
    wallets.list.mockResolvedValue([{ balance: '1500000' }, { balance: '-200000' }] as never);

    const s = await service.summary('u1', { month: '2026-10' });

    expect(wallets.list).toHaveBeenCalledWith('u1', false);
    expect(repo.sumByType.mock.calls[0][0]).toBe('u1');
    expect(repo.sumByType.mock.calls[1][1].toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(s).toMatchObject({
      month: '2026-10',
      previousMonth: '2026-09',
      totalIncome: '5000000',
      totalExpense: '2000000',
      net: '3000000',
      totalBalance: '1300000',
      change: { income: 25, expense: -20, net: 100 },
    });
  });

  it('summary: bulan kosong = 0 dan perubahan null', async () => {
    repo.sumByType.mockResolvedValue({ income: 0n, expense: 0n });
    wallets.list.mockResolvedValue([]);
    const s = await service.summary('u1', { month: '2026-01' });
    expect(s).toMatchObject({ totalIncome: '0', totalExpense: '0', net: '0', totalBalance: '0' });
    expect(s.change).toEqual({ income: null, expense: null, net: null });
    expect(s.previousMonth).toBe('2025-12');
  });

  it('by-category: urut terbesar, persen, jumlah transaksi, nama dari kategori', async () => {
    repo.totalsByCategory.mockResolvedValue([
      { categoryId: 'a', total: 100_000n, count: 2 },
      { categoryId: 'b', total: 300_000n, count: 5 },
    ]);
    repo.findCategories.mockResolvedValue([
      { id: 'a', name: 'Transport', color: '#111111', icon: null },
      { id: 'b', name: 'Makan', color: null, icon: '🍽️' },
    ]);
    const r = await service.byCategory('u1', { month: '2026-10', type: 'EXPENSE' });
    expect(repo.totalsByCategory.mock.calls[0].slice(0, 2)).toEqual(['u1', 'EXPENSE']);
    expect(r.total).toBe('400000');
    expect(r.items.map((i) => [i.name, i.total, i.percent, i.count])).toEqual([
      ['Makan', '300000', 75, 5],
      ['Transport', '100000', 25, 2],
    ]);
  });

  it('by-category: tanpa data → items kosong, total 0', async () => {
    repo.totalsByCategory.mockResolvedValue([]);
    repo.findCategories.mockResolvedValue([]);
    const r = await service.byCategory('u1', { month: '2026-10', type: 'INCOME' });
    expect(r).toEqual({ month: '2026-10', type: 'INCOME', total: '0', items: [] });
  });

  it('trend: bulan tanpa transaksi diisi 0, urut lama → baru, panjang = months', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T05:00:00Z'));
    try {
      repo.monthlyTotals.mockResolvedValue([
        { month: '2026-10', type: 'INCOME', total: 5_000_000n },
        { month: '2026-10', type: 'EXPENSE', total: 1_000_000n },
        { month: '2026-08', type: 'EXPENSE', total: 700_000n },
      ]);
      const { months } = await service.trend('u1', { months: 4 });
      expect(months).toEqual([
        { month: '2026-07', income: '0', expense: '0', net: '0' },
        { month: '2026-08', income: '0', expense: '700000', net: '-700000' },
        { month: '2026-09', income: '0', expense: '0', net: '0' },
        { month: '2026-10', income: '5000000', expense: '1000000', net: '4000000' },
      ]);
      const [uid, start, end] = repo.monthlyTotals.mock.calls[0];
      expect(uid).toBe('u1');
      expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('period: total, net, dan 3 kategori pengeluaran terbesar dengan persen', async () => {
    repo.sumByType.mockResolvedValue({ income: 1_000_000n, expense: 400_000n });
    repo.totalsByCategory.mockResolvedValue([
      { categoryId: 'a', total: 50_000n, count: 1 },
      { categoryId: 'b', total: 200_000n, count: 2 },
      { categoryId: 'c', total: 100_000n, count: 1 },
      { categoryId: 'd', total: 50_000n, count: 1 },
    ]);
    repo.findCategories.mockResolvedValue([
      { id: 'b', name: 'Makan', color: null, icon: '🍽️' },
      { id: 'c', name: 'Transport', color: null, icon: null },
      { id: 'a', name: 'Lain', color: null, icon: null },
    ]);
    const r = await service.period('u1', new Date('2026-10-23T00:00:00Z'), new Date('2026-10-24T00:00:00Z'));
    expect(r).toMatchObject({ totalIncome: '1000000', totalExpense: '400000', net: '600000' });
    expect(r.topExpenseCategories.map((c) => [c.name, c.total, c.percent])).toEqual([
      ['Makan', '200000', 50],
      ['Transport', '100000', 25],
      ['Lain', '50000', 12.5],
    ]);
    expect(repo.sumByType.mock.calls[0][0]).toBe('u1');
  });
});
