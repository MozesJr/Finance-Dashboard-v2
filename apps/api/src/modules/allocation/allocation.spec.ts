import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { allocationStatus, AllocationService } from './allocation.service';
import { AllocationRepository } from './allocation.repository';
import { SavingsService } from '../savings/savings.service';

const G_DD = '11111111-1111-4111-8111-111111111111';
const G_INV = '22222222-2222-4222-8222-222222222222';

const item = (over: Record<string, unknown>) => ({
  id: 'i',
  planId: 'p1',
  phase: 1,
  name: 'X',
  description: null,
  kind: 'EXPENSE',
  percent: 0,
  color: null,
  icon: null,
  sortOrder: 0,
  linkedGoalId: null,
  categories: [] as Array<{ categoryId: string }>,
  createdAt: new Date(),
  ...over,
});

const plan = (items: unknown[], over: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'u1',
  monthlyIncome: 10_000_000n,
  activePhase: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  items,
  ...over,
});

const phase1 = () => [
  item({ id: 'a', name: 'Perpuluhan', percent: 10, sortOrder: 0, categories: [{ categoryId: 'cat-donasi' }] }),
  item({ id: 'b', name: 'Kebutuhan', percent: 45, sortOrder: 1, categories: [{ categoryId: 'cat-makan' }, { categoryId: 'cat-kos' }] }),
  item({ id: 'c', name: 'Dana Darurat', kind: 'SAVING', percent: 15, sortOrder: 2, linkedGoalId: G_DD }),
  item({ id: 'd', name: 'Investasi', kind: 'SAVING', percent: 15, sortOrder: 3, linkedGoalId: G_INV }),
  item({ id: 'e', name: 'Gaya Hidup', percent: 15, sortOrder: 4, categories: [{ categoryId: 'cat-hiburan' }] }),
];

describe('allocationStatus', () => {
  it('EXPENSE: BELUM_ADA, AMAN (<80%), HAMPIR (80–100%), LEBIH (>100%)', () => {
    expect(allocationStatus('EXPENSE', 1_000n, 0n)).toBe('BELUM_ADA');
    expect(allocationStatus('EXPENSE', 1_000n, 799n)).toBe('AMAN');
    expect(allocationStatus('EXPENSE', 1_000n, 800n)).toBe('HAMPIR');
    expect(allocationStatus('EXPENSE', 1_000n, 1_000n)).toBe('HAMPIR');
    expect(allocationStatus('EXPENSE', 1_000n, 1_001n)).toBe('LEBIH');
    expect(allocationStatus('EXPENSE', 0n, 1n)).toBe('LEBIH');
  });

  it('SAVING: BELUM_ADA, KURANG, TERCAPAI', () => {
    expect(allocationStatus('SAVING', 1_000n, 0n)).toBe('BELUM_ADA');
    expect(allocationStatus('SAVING', 1_000n, -50n)).toBe('BELUM_ADA');
    expect(allocationStatus('SAVING', 1_000n, 999n)).toBe('KURANG');
    expect(allocationStatus('SAVING', 1_000n, 1_000n)).toBe('TERCAPAI');
    expect(allocationStatus('SAVING', 1_000n, 5_000n)).toBe('TERCAPAI');
  });
});

describe('AllocationService', () => {
  let repo: jest.Mocked<AllocationRepository>;
  let savings: jest.Mocked<SavingsService>;
  let service: AllocationService;

  beforeEach(() => {
    repo = {
      findPlan: jest.fn(),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      replacePhaseItems: jest.fn(),
      findVisibleExpenseCategoryIds: jest.fn(),
      expenseByCategory: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<AllocationRepository>;
    savings = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      getOwnedGoal: jest.fn(),
      netByGoalInRange: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<SavingsService>;
    service = new AllocationService(repo, savings);
  });

  describe('report', () => {
    it('tanpa plan → 404 dengan pesan jelas', async () => {
      repo.findPlan.mockResolvedValue(null);
      await expect(service.report('u1', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('nominal terbagi dengan BigInt, total = gaji persis (sisa ke pos terbesar)', async () => {
      repo.findPlan.mockResolvedValue(plan(phase1(), { monthlyIncome: 1_234_567n }) as never);
      const r = await service.report('u1', { month: '2026-10' });
      expect(r.items.map((i) => i.planned)).toEqual(['123456', '555556', '185185', '185185', '185185']);
      expect(r.totals.planned).toBe('1234567');
      expect(r.items.reduce((a, i) => a + BigInt(i.planned), 0n)).toBe(1_234_567n);
    });

    it('realisasi EXPENSE = total kategori terhubung; SAVING = setoran bersih goal; query memakai rentang bulan', async () => {
      repo.findPlan.mockResolvedValue(plan(phase1()) as never);
      repo.expenseByCategory.mockResolvedValue(
        new Map([
          ['cat-makan', 2_000_000n],
          ['cat-kos', 1_500_000n],
          ['cat-hiburan', 1_600_000n],
          ['cat-lain', 999_999n], // tidak terhubung → tidak dihitung
        ]),
      );
      savings.netByGoalInRange.mockResolvedValue(new Map([[G_DD, 1_500_000n]]));

      const r = await service.report('u1', { month: '2026-10' });
      const byName = Object.fromEntries(r.items.map((i) => [i.name, i]));

      // Kebutuhan: planned 4,5jt, realized 3,5jt → 77,8% → AMAN
      expect(byName['Kebutuhan']).toMatchObject({ planned: '4500000', realized: '3500000', remaining: '1000000', diff: '-1000000', status: 'AMAN' });
      // Gaya hidup: planned 1,5jt, realized 1,6jt → LEBIH
      expect(byName['Gaya Hidup']).toMatchObject({ realized: '1600000', remaining: '0', diff: '100000', status: 'LEBIH' });
      expect(byName['Perpuluhan'].status).toBe('BELUM_ADA');
      expect(byName['Dana Darurat']).toMatchObject({ realized: '1500000', status: 'TERCAPAI', goalId: G_DD });
      expect(byName['Investasi'].status).toBe('BELUM_ADA');

      const [, start, end] = repo.expenseByCategory.mock.calls[0];
      expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(r.totals).toMatchObject({ planned: '10000000', realized: '6600000' });
    });

    it('fase default = activePhase; pos SAVING 0% ditandai dialihkan', async () => {
      const items = [
        ...phase1(),
        item({ phase: 2, id: 'f', name: 'Dana Darurat', kind: 'SAVING', percent: 0, linkedGoalId: G_DD, sortOrder: 0 }),
        item({ phase: 2, id: 'g', name: 'Investasi', kind: 'SAVING', percent: 100, linkedGoalId: G_INV, sortOrder: 1 }),
      ];
      repo.findPlan.mockResolvedValue(plan(items, { activePhase: 2 }) as never);
      const r = await service.report('u1', {});
      expect(r.phase).toBe(2);
      expect(r.items.find((i) => i.name === 'Dana Darurat')).toMatchObject({ dialihkan: true, planned: '0' });
      expect(r.items.find((i) => i.name === 'Investasi')?.dialihkan).toBe(false);
    });

    it('suggestPhase2: hanya bila Fase 1 aktif dan goal darurat ≥ 100%', async () => {
      repo.findPlan.mockResolvedValue(plan(phase1()) as never);
      savings.list.mockResolvedValue([{ id: G_DD, type: 'EMERGENCY', isArchived: false, percent: 100 }] as never);
      expect((await service.report('u1', {})).suggestPhase2).toBe(true);

      savings.list.mockResolvedValue([{ id: G_DD, type: 'EMERGENCY', isArchived: false, percent: 99.9 }] as never);
      expect((await service.report('u1', {})).suggestPhase2).toBe(false);

      savings.list.mockResolvedValue([{ id: G_DD, type: 'EMERGENCY', isArchived: false, percent: null }] as never);
      expect((await service.report('u1', {})).suggestPhase2).toBe(false);

      repo.findPlan.mockResolvedValue(plan(phase1(), { activePhase: 2 }) as never);
      savings.list.mockResolvedValue([{ id: G_DD, type: 'EMERGENCY', isArchived: false, percent: 150 }] as never);
      expect((await service.report('u1', {})).suggestPhase2).toBe(false);
    });
  });

  describe('fromTemplate', () => {
    const allCats = [
      'cat-expense-donasi', 'cat-expense-makan', 'cat-expense-kos', 'cat-expense-listrik',
      'cat-expense-internet', 'cat-expense-transport', 'cat-expense-belanja', 'cat-expense-hiburan', 'cat-expense-hobi',
    ];

    beforeEach(() => {
      repo.findPlan.mockResolvedValue(null);
      repo.findVisibleExpenseCategoryIds.mockResolvedValue(allCats);
      repo.createPlan.mockImplementation(async (_u, data) => plan(data.items.map((i, n) => item({ ...i, id: `n${n}`, categories: i.categoryIds.map((categoryId) => ({ categoryId })) }))) as never);
    });

    it('plan sudah ada → 409 dan tidak membuat goal', async () => {
      repo.findPlan.mockResolvedValue(plan([]) as never);
      await expect(service.fromTemplate('u1', { monthlyIncome: 10n })).rejects.toBeInstanceOf(ConflictException);
      expect(savings.create).not.toHaveBeenCalled();
    });

    it('membuat goal darurat & investasi bila belum ada, lalu plan Fase 1 & 2 sesuai template', async () => {
      savings.create
        .mockResolvedValueOnce({ id: G_DD } as never)
        .mockResolvedValueOnce({ id: G_INV } as never);
      await service.fromTemplate('u1', { monthlyIncome: 10_000_000n });

      expect(savings.create).toHaveBeenCalledTimes(2);
      expect(savings.create.mock.calls[0][1]).toMatchObject({ type: 'EMERGENCY', targetMode: 'MONTHS_OF_EXPENSE', targetMonths: 6 });
      expect(savings.create.mock.calls[1][1]).toMatchObject({ type: 'INVESTMENT' });

      const { monthlyIncome, activePhase, items } = repo.createPlan.mock.calls[0][1];
      expect(monthlyIncome).toBe(10_000_000n);
      expect(activePhase).toBe(1);
      const pct = (phase: number) => Object.fromEntries(items.filter((i) => i.phase === phase).map((i) => [i.name, i.percent]));
      expect(pct(1)).toEqual({ Perpuluhan: 10, 'Kebutuhan Primer': 45, 'Dana Darurat': 15, Investasi: 15, 'Gaya Hidup & Hiburan': 15 });
      expect(pct(2)).toEqual({ Perpuluhan: 10, 'Kebutuhan Primer': 45, 'Dana Darurat': 0, Investasi: 30, 'Gaya Hidup & Hiburan': 15 });
      for (const phase of [1, 2]) {
        expect(items.filter((i) => i.phase === phase).reduce((a, i) => a + i.percent, 0)).toBe(100);
      }
      expect(items.find((i) => i.phase === 1 && i.name === 'Dana Darurat')?.linkedGoalId).toBe(G_DD);
      expect(items.find((i) => i.phase === 1 && i.name === 'Kebutuhan Primer')?.categoryIds).toHaveLength(6);
    });

    it('memakai goal aktif yang sudah ada (tidak membuat duplikat)', async () => {
      savings.list.mockResolvedValue([
        { id: G_DD, type: 'EMERGENCY' },
        { id: G_INV, type: 'INVESTMENT' },
      ] as never);
      await service.fromTemplate('u1', { monthlyIncome: 10_000_000n });
      expect(savings.create).not.toHaveBeenCalled();
      expect(repo.createPlan.mock.calls[0][1].items.find((i) => i.name === 'Investasi')?.linkedGoalId).toBe(G_INV);
    });
  });

  describe('putPhaseItems', () => {
    const body = (over: Record<string, unknown> = {}) => ({
      items: [
        { name: 'Kebutuhan', kind: 'EXPENSE' as const, percent: 60, categoryIds: ['cat-makan'], ...over },
        { name: 'Tabungan', kind: 'SAVING' as const, percent: 40, categoryIds: [], goalId: G_DD },
      ],
    });

    beforeEach(() => {
      repo.findPlan.mockResolvedValue(plan(phase1()) as never);
      repo.findVisibleExpenseCategoryIds.mockResolvedValue(['cat-makan']);
      savings.getOwnedGoal.mockResolvedValue({ id: G_DD } as never);
    });

    it('menyimpan set item satu fase secara atomik dengan sortOrder = urutan', async () => {
      await service.putPhaseItems('u1', 2, body() as never);
      expect(repo.replacePhaseItems).toHaveBeenCalledTimes(1);
      const [planId, phase, items] = repo.replacePhaseItems.mock.calls[0];
      expect([planId, phase]).toEqual(['p1', 2]);
      expect(items.map((i) => [i.name, i.sortOrder, i.percent, i.phase])).toEqual([
        ['Kebutuhan', 0, 60, 2],
        ['Tabungan', 1, 40, 2],
      ]);
      expect(items[1].linkedGoalId).toBe(G_DD);
    });

    it('kategori tidak ditemukan / bukan pengeluaran / milik user lain → 404, tidak menyimpan', async () => {
      repo.findVisibleExpenseCategoryIds.mockResolvedValue([]);
      await expect(service.putPhaseItems('u1', 1, body() as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.replacePhaseItems).not.toHaveBeenCalled();
    });

    it('goal milik user lain → 404, tidak menyimpan', async () => {
      savings.getOwnedGoal.mockRejectedValue(new NotFoundException('Goal tidak ditemukan'));
      await expect(service.putPhaseItems('u1', 1, body() as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.replacePhaseItems).not.toHaveBeenCalled();
    });

    it('tanpa plan → 404', async () => {
      repo.findPlan.mockResolvedValue(null);
      await expect(service.putPhaseItems('u1', 1, body() as never)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updatePlan', () => {
    it('pindah ke fase yang belum punya pos ditolak (400); gaji bisa diubah', async () => {
      repo.findPlan.mockResolvedValue(plan(phase1()) as never);
      await expect(service.updatePlan('u1', { activePhase: 2 })).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updatePlan).not.toHaveBeenCalled();

      await service.updatePlan('u1', { monthlyIncome: 12_000_000n });
      expect(repo.updatePlan).toHaveBeenCalledWith('u1', { monthlyIncome: 12_000_000n });
    });
  });
});
