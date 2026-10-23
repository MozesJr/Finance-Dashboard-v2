import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { averageExpense, effectiveTarget, estimateMonths, SavingsService } from './savings.service';
import { GoalUnitOfWork, SavingsRepository } from './savings.repository';
import { WalletsService } from '../wallets/wallets.service';

const W_GOAL = '11111111-1111-4111-8111-111111111111';
const W_CASH = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-20T03:00:00.000Z');

const goal = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  userId: 'u1',
  name: 'Dana Darurat',
  type: 'EMERGENCY',
  icon: null,
  color: null,
  targetMode: 'MANUAL',
  targetAmount: 10_000_000n,
  targetMonths: null,
  targetDate: null,
  walletId: W_GOAL,
  wallet: { id: W_GOAL, name: 'RDPU' },
  isArchived: false,
  createdAt: now,
  updatedAt: now,
  ...over,
});

const contribution = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  goalId: 'g1',
  userId: 'u1',
  type: 'DEPOSIT',
  amount: 1_000_000n,
  date: new Date('2026-10-20T00:00:00Z'),
  note: null,
  transactionId: null,
  createdAt: now,
  ...over,
});

describe('pure helpers', () => {
  it('averageExpense: rata-rata hanya dari bulan yang punya data', () => {
    expect(averageExpense([])).toBeNull();
    expect(averageExpense([{ month: '2026-09', total: 2_000_000n }])).toEqual({ avg: 2_000_000n, basisMonths: 1 });
    expect(
      averageExpense([
        { month: '2026-07', total: 3_000_000n },
        { month: '2026-09', total: 2_000_000n },
      ]),
    ).toEqual({ avg: 2_500_000n, basisMonths: 2 });
  });

  it('effectiveTarget: MANUAL pakai targetAmount; MONTHS_OF_EXPENSE = bulan × rata-rata; tanpa data → null + pesan', () => {
    expect(effectiveTarget({ targetMode: 'MANUAL', targetAmount: 5_000_000n, targetMonths: null }, null)).toEqual({
      target: 5_000_000n,
      note: null,
    });
    expect(
      effectiveTarget({ targetMode: 'MONTHS_OF_EXPENSE', targetAmount: null, targetMonths: 6 }, { avg: 2_500_000n, basisMonths: 2 }),
    ).toEqual({ target: 15_000_000n, note: null });
    const none = effectiveTarget({ targetMode: 'MONTHS_OF_EXPENSE', targetAmount: null, targetMonths: 6 }, null);
    expect(none.target).toBeNull();
    expect(none.note).toContain('Belum ada data pengeluaran');
  });

  it('estimateMonths: bulat ke atas, null bila setoran bersih ≤ 0 / tanpa target / tanpa riwayat, 0 bila tercapai', () => {
    const stats = (windowNet: bigint, first: string) => ({ windowNet, firstDate: new Date(`${first}T00:00:00Z`) });
    // mulai 3 bulan lalu, net 3jt dalam jendela → 1jt/bulan; sisa 2,5jt → 3 bulan
    expect(estimateMonths(2_500_000n, stats(3_000_000n, '2026-08-15'), '2026-10')).toBe(3);
    // baru mulai bulan ini → dibagi 1 bulan
    expect(estimateMonths(2_500_000n, stats(1_000_000n, '2026-10-02'), '2026-10')).toBe(3);
    expect(estimateMonths(2_000_000n, stats(0n, '2026-08-15'), '2026-10')).toBeNull();
    expect(estimateMonths(2_000_000n, stats(-500_000n, '2026-08-15'), '2026-10')).toBeNull();
    expect(estimateMonths(null, stats(1n, '2026-08-15'), '2026-10')).toBeNull();
    expect(estimateMonths(2_000_000n, undefined, '2026-10')).toBeNull();
    expect(estimateMonths(0n, undefined, '2026-10')).toBe(0);
  });
});

describe('SavingsService', () => {
  let repo: jest.Mocked<SavingsRepository>;
  let wallets: jest.Mocked<WalletsService>;
  let uow: jest.Mocked<GoalUnitOfWork>;
  let service: SavingsService;

  beforeEach(() => {
    repo = {
      findGoals: jest.fn(),
      findGoal: jest.fn(),
      hasActiveEmergency: jest.fn(),
      createGoal: jest.fn(),
      updateGoal: jest.fn(),
      deleteGoal: jest.fn(),
      countContributions: jest.fn(),
      collectedByGoal: jest.fn().mockResolvedValue(new Map()),
      contributionStats: jest.fn().mockResolvedValue(new Map()),
      netByGoalInRange: jest.fn(),
      monthlyExpenseTotals: jest.fn().mockResolvedValue([]),
      findContributions: jest.fn(),
      findContribution: jest.fn(),
      runInGoalLock: jest.fn(),
    } as unknown as jest.Mocked<SavingsRepository>;
    uow = {
      collected: jest.fn(),
      findContribution: jest.fn(),
      createTransfer: jest.fn(),
      updateTransfer: jest.fn(),
      deleteTransfer: jest.fn(),
      createContribution: jest.fn(),
      updateContribution: jest.fn(),
      deleteContribution: jest.fn(),
    } as unknown as jest.Mocked<GoalUnitOfWork>;
    repo.runInGoalLock.mockImplementation(async (_u, _g, fn) => fn(uow));
    wallets = { getOwned: jest.fn() } as unknown as jest.Mocked<WalletsService>;
    wallets.getOwned.mockImplementation(async (_u, id) => ({ id, name: id, isArchived: false }) as never);
    service = new SavingsService(repo, wallets);
  });

  describe('goals', () => {
    it('response: terkumpul dihitung dari agregasi, percent/remaining dari target, tanpa userId', async () => {
      repo.findGoals.mockResolvedValue([goal()] as never);
      repo.collectedByGoal.mockResolvedValue(new Map([['g1', 2_500_000n]]));
      const [g] = await service.list('u1');
      expect(g).toMatchObject({ collected: '2500000', target: '10000000', remaining: '7500000', percent: 25 });
      expect(g).not.toHaveProperty('userId');
    });

    it('MONTHS_OF_EXPENSE: target = bulan × rata-rata, menyertakan rata-rata & basis; tanpa data → target null', async () => {
      repo.findGoals.mockResolvedValue([goal({ targetMode: 'MONTHS_OF_EXPENSE', targetAmount: null, targetMonths: 6 })] as never);
      repo.monthlyExpenseTotals.mockResolvedValue([{ month: '2026-09', total: 2_000_000n }]);
      let [g] = await service.list('u1');
      expect(g).toMatchObject({ target: '12000000', avgMonthlyExpense: '2000000', basisMonths: 1, targetNote: null });

      repo.monthlyExpenseTotals.mockResolvedValue([]);
      [g] = await service.list('u1');
      expect(g.target).toBeNull();
      expect(g.remaining).toBeNull();
      expect(g.percent).toBeNull();
      expect(g.targetNote).toContain('Belum ada data');
    });

    it('rata-rata pengeluaran diambil dari 3 bulan penuh sebelum bulan berjalan', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-22T05:00:00Z'));
      try {
        repo.findGoals.mockResolvedValue([goal({ targetMode: 'MONTHS_OF_EXPENSE', targetAmount: null, targetMonths: 6 })] as never);
        await service.list('u1');
        const [, start, end] = repo.monthlyExpenseTotals.mock.calls[0];
        expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
        expect(end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      } finally {
        jest.useRealTimers();
      }
    });

    it('maksimal 1 goal EMERGENCY aktif (create dan unarchive)', async () => {
      repo.hasActiveEmergency.mockResolvedValue(true);
      await expect(service.create('u1', { name: 'DD2', type: 'EMERGENCY', targetMode: 'MANUAL' })).rejects.toBeInstanceOf(ConflictException);
      expect(repo.createGoal).not.toHaveBeenCalled();

      repo.findGoal.mockResolvedValue(goal({ isArchived: true }) as never);
      await expect(service.update('u1', 'g1', { isArchived: false })).rejects.toBeInstanceOf(ConflictException);
      expect(repo.updateGoal).not.toHaveBeenCalled();
    });

    it('goal bertipe lain tidak dibatasi', async () => {
      repo.hasActiveEmergency.mockResolvedValue(true);
      repo.createGoal.mockResolvedValue(goal({ id: 'g2', type: 'INVESTMENT' }) as never);
      repo.findGoals.mockResolvedValue([goal({ id: 'g2', type: 'INVESTMENT' })] as never);
      await service.create('u1', { name: 'Saham', type: 'INVESTMENT', targetMode: 'MANUAL' });
      expect(repo.createGoal).toHaveBeenCalled();
    });

    it('goal milik user lain → 404; hapus goal berkontribusi → 409', async () => {
      repo.findGoal.mockResolvedValue(null);
      await expect(service.update('u1', 'x', { name: 'a' })).rejects.toBeInstanceOf(NotFoundException);
      repo.findGoal.mockResolvedValue(goal() as never);
      repo.countContributions.mockResolvedValue(2);
      await expect(service.remove('u1', 'g1')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.deleteGoal).not.toHaveBeenCalled();
    });

    it('create menormalkan target menurut mode (MONTHS: amount dikosongkan & default 6 bulan)', async () => {
      repo.hasActiveEmergency.mockResolvedValue(false);
      repo.createGoal.mockResolvedValue(goal() as never);
      repo.findGoals.mockResolvedValue([goal()] as never);
      await service.create('u1', { name: 'DD', type: 'EMERGENCY', targetMode: 'MONTHS_OF_EXPENSE', targetAmount: 5n });
      expect(repo.createGoal.mock.calls[0][1]).toMatchObject({ targetMode: 'MONTHS_OF_EXPENSE', targetAmount: null, targetMonths: 6 });
    });
  });

  describe('contributions', () => {
    beforeEach(() => repo.findGoal.mockResolvedValue(goal() as never));

    it('DEPOSIT dengan dompet sumber → transfer sumber → dompet goal, satu transaksi DB, transactionId tersimpan', async () => {
      uow.createTransfer.mockResolvedValue('tx1');
      uow.createContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      const res = await service.addContribution('u1', 'g1', {
        type: 'DEPOSIT',
        amount: 1_000_000n,
        date: '2026-10-20',
        walletId: W_CASH,
      });
      expect(repo.runInGoalLock).toHaveBeenCalledTimes(1);
      expect(uow.createTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: W_CASH, toWalletId: W_GOAL, amount: 1_000_000n, note: 'Tabungan: Dana Darurat' }),
      );
      expect(uow.createContribution).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEPOSIT', transactionId: 'tx1' }));
      expect(res.transactionId).toBe('tx1');
    });

    it('WITHDRAW dengan dompet tujuan → transfer arah terbalik (dompet goal → tujuan)', async () => {
      uow.collected.mockResolvedValue(5_000_000n);
      uow.createTransfer.mockResolvedValue('tx2');
      uow.createContribution.mockResolvedValue(contribution({ type: 'WITHDRAW', transactionId: 'tx2' }) as never);
      await service.addContribution('u1', 'g1', { type: 'WITHDRAW', amount: 1_000_000n, walletId: W_CASH });
      expect(uow.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ walletId: W_GOAL, toWalletId: W_CASH }));
    });

    it('tanpa dompet lawan → hanya kontribusi, tanpa transfer', async () => {
      uow.createContribution.mockResolvedValue(contribution() as never);
      await service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1_000_000n });
      expect(uow.createTransfer).not.toHaveBeenCalled();
      expect(uow.createContribution).toHaveBeenCalledWith(expect.objectContaining({ transactionId: null }));
    });

    it('WITHDRAW melebihi terkumpul ditolak (409) dan tidak menulis apa pun', async () => {
      uow.collected.mockResolvedValue(500_000n);
      await expect(
        service.addContribution('u1', 'g1', { type: 'WITHDRAW', amount: 1_000_000n, walletId: W_CASH }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(uow.createTransfer).not.toHaveBeenCalled();
      expect(uow.createContribution).not.toHaveBeenCalled();
    });

    it('WITHDRAW persis sebesar terkumpul diperbolehkan', async () => {
      uow.collected.mockResolvedValue(1_000_000n);
      uow.createContribution.mockResolvedValue(contribution({ type: 'WITHDRAW' }) as never);
      await service.addContribution('u1', 'g1', { type: 'WITHDRAW', amount: 1_000_000n });
      expect(uow.createContribution).toHaveBeenCalled();
    });

    it('atomik: kegagalan setelah transfer dibuat naik ke pemanggil (rollback ditangani transaksi DB), tidak ada penulisan di luar uow', async () => {
      uow.createTransfer.mockResolvedValue('tx1');
      uow.createContribution.mockRejectedValue(new Error('db down'));
      await expect(
        service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1_000n, walletId: W_CASH }),
      ).rejects.toThrow('db down');
      expect(repo.runInGoalLock).toHaveBeenCalledTimes(1);
    });

    it('dompet sumber diisi tetapi goal tanpa dompet → 400; dompet sama dengan dompet goal → 400; dompet user lain → 404', async () => {
      repo.findGoal.mockResolvedValue(goal({ walletId: null, wallet: null }) as never);
      await expect(
        service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n, walletId: W_CASH }),
      ).rejects.toBeInstanceOf(BadRequestException);

      repo.findGoal.mockResolvedValue(goal() as never);
      await expect(
        service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n, walletId: W_GOAL }),
      ).rejects.toBeInstanceOf(BadRequestException);

      wallets.getOwned.mockRejectedValue(new NotFoundException('Wallet tidak ditemukan'));
      await expect(
        service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n, walletId: W_CASH }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.runInGoalLock).not.toHaveBeenCalled();
    });

    describe('goal tanpa dompet penyimpanan (dompet dipilih per setoran/penarikan)', () => {
      const W_INV = '33333333-3333-4333-8333-333333333333';
      beforeEach(() => repo.findGoal.mockResolvedValue(goal({ walletId: null, wallet: null }) as never));

      it('DEPOSIT: walletId = sumber, counterWalletId = tujuan → satu TRANSFER sumber → tujuan', async () => {
        uow.createTransfer.mockResolvedValue('tx1');
        uow.createContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
        await service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1_000_000n, walletId: W_CASH, counterWalletId: W_INV });
        expect(uow.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ walletId: W_CASH, toWalletId: W_INV }));
        expect(uow.createContribution).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'tx1' }));
      });

      it('WITHDRAW: counterWalletId = dompet asal, walletId = tujuan → TRANSFER asal → tujuan', async () => {
        uow.collected.mockResolvedValue(2_000_000n);
        uow.createTransfer.mockResolvedValue('tx2');
        uow.createContribution.mockResolvedValue(contribution({ type: 'WITHDRAW', transactionId: 'tx2' }) as never);
        await service.addContribution('u1', 'g1', { type: 'WITHDRAW', amount: 1_000_000n, walletId: W_CASH, counterWalletId: W_INV });
        expect(uow.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ walletId: W_INV, toWalletId: W_CASH }));
      });

      it('counterWalletId tanpa walletId → 400, tidak ada tulisan', async () => {
        await expect(
          service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n, counterWalletId: W_INV }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.runInGoalLock).not.toHaveBeenCalled();
      });

      it('walletId tanpa counterWalletId → 400; dua dompet sama → 400', async () => {
        await expect(service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n, walletId: W_CASH })).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n, walletId: W_CASH, counterWalletId: W_CASH }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('tanpa keduanya → hanya kontribusi (perilaku lama)', async () => {
        uow.createContribution.mockResolvedValue(contribution() as never);
        await service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1_000_000n });
        expect(uow.createTransfer).not.toHaveBeenCalled();
      });
    });

    it('goal yang punya dompet mengabaikan counterWalletId (perilaku lama tetap)', async () => {
      uow.createTransfer.mockResolvedValue('tx1');
      uow.createContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      await service.addContribution('u1', 'g1', {
        type: 'DEPOSIT',
        amount: 1_000_000n,
        walletId: W_CASH,
        counterWalletId: '44444444-4444-4444-8444-444444444444',
      });
      expect(uow.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ walletId: W_CASH, toWalletId: W_GOAL }));
    });

    it('goal diarsipkan tidak menerima kontribusi baru', async () => {
      repo.findGoal.mockResolvedValue(goal({ isArchived: true }) as never);
      await expect(service.addContribution('u1', 'g1', { type: 'DEPOSIT', amount: 1n })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update: nominal setoran dikurangi ikut mengubah transfer; membuat saldo minus ditolak', async () => {
      repo.findContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      uow.findContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      uow.collected.mockResolvedValue(1_000_000n);
      uow.updateContribution.mockResolvedValue(contribution({ amount: 400_000n, transactionId: 'tx1' }) as never);
      await service.updateContribution('u1', 'c1', { amount: 400_000n });
      expect(uow.updateTransfer).toHaveBeenCalledWith('tx1', { amount: 400_000n });

      // saldo 100rb tapi setoran 1jt diturunkan jadi 400rb → saldo -500rb
      uow.collected.mockResolvedValue(100_000n);
      uow.updateContribution.mockClear();
      await expect(service.updateContribution('u1', 'c1', { amount: 400_000n })).rejects.toBeInstanceOf(ConflictException);
      expect(uow.updateContribution).not.toHaveBeenCalled();
    });

    it('update hanya catatan tidak menyentuh transfer', async () => {
      repo.findContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      uow.findContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      uow.updateContribution.mockResolvedValue(contribution() as never);
      await service.updateContribution('u1', 'c1', { note: 'baru' });
      expect(uow.updateTransfer).not.toHaveBeenCalled();
    });

    it('hapus kontribusi ikut menghapus transfer terhubung; menghapus setoran yang membuat saldo minus ditolak', async () => {
      repo.findContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      uow.findContribution.mockResolvedValue(contribution({ transactionId: 'tx1' }) as never);
      uow.collected.mockResolvedValue(1_000_000n);
      await service.removeContribution('u1', 'c1');
      expect(uow.deleteContribution).toHaveBeenCalledWith('c1');
      expect(uow.deleteTransfer).toHaveBeenCalledWith('tx1');

      uow.collected.mockResolvedValue(300_000n);
      uow.deleteContribution.mockClear();
      uow.deleteTransfer.mockClear();
      await expect(service.removeContribution('u1', 'c1')).rejects.toBeInstanceOf(ConflictException);
      expect(uow.deleteContribution).not.toHaveBeenCalled();
      expect(uow.deleteTransfer).not.toHaveBeenCalled();
    });

    it('menghapus WITHDRAW selalu boleh (menambah saldo)', async () => {
      repo.findContribution.mockResolvedValue(contribution({ type: 'WITHDRAW' }) as never);
      uow.findContribution.mockResolvedValue(contribution({ type: 'WITHDRAW' }) as never);
      await service.removeContribution('u1', 'c1');
      expect(uow.collected).not.toHaveBeenCalled();
      expect(uow.deleteContribution).toHaveBeenCalled();
    });

    it('kontribusi milik user lain → 404', async () => {
      repo.findContribution.mockResolvedValue(null);
      await expect(service.updateContribution('u1', 'x', { note: 'a' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.removeContribution('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.runInGoalLock).not.toHaveBeenCalled();
    });
  });
});
