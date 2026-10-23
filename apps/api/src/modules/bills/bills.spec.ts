import { BadRequestException, NotFoundException } from '@nestjs/common';
import { fakePeriods } from '../periods/periods.testing';
import { TransactionEvents } from '../transactions/transaction-events';
import { BillsService } from './bills.service';

const W_BCA = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-23T03:00:00Z'); // periode berjalan 2026-10 (startDay 1)

const bill = (over: Record<string, unknown> = {}) => ({
  id: 'b1', userId: 'u1', name: 'Kos', amount: 3_000_000n, categoryId: 'cat-expense-kos', walletId: null, intervalMonths: 3, dueDay: 25,
  nextDueDate: new Date('2026-11-25T00:00:00Z'), isActive: true, remindDays: [7, 1], snoozedUntil: null,
  createdAt: new Date('2026-08-10T00:00:00Z'), updatedAt: NOW, ...over,
});

const build = (startDay = 1) => {
  const repo = {
    list: jest.fn().mockResolvedValue([bill()]),
    findById: jest.fn().mockResolvedValue(bill()),
    create: jest.fn().mockResolvedValue({ id: 'b1' }),
    update: jest.fn().mockResolvedValue(bill()),
    lastPaidOn: jest.fn().mockResolvedValue(new Map()),
    payments: jest.fn().mockResolvedValue([]),
    paymentsDueIn: jest.fn().mockResolvedValue([]),
    settle: jest.fn().mockResolvedValue(true),
    findRemindable: jest.fn().mockResolvedValue([]),
    findSnoozedFor: jest.fn().mockResolvedValue([]),
    claimReminder: jest.fn().mockResolvedValue(true),
    releaseReminder: jest.fn().mockResolvedValue(undefined),
  };
  const transactions = {
    create: jest.fn(async (_u: string, input: Record<string, unknown>, opts: { billId?: string }) => ({ id: 'tx1', status: 'CONFIRMED', amount: String(input.amount), date: input.date, billId: opts.billId ?? null })),
    createDraft: jest.fn(async () => ({ id: 'draft1', status: 'DRAFT' })),
  };
  const wallets = {
    getOwned: jest.fn().mockResolvedValue({ id: W_BCA }),
    findDefault: jest.fn().mockResolvedValue({ id: W_BCA }),
    list: jest.fn().mockResolvedValue([{ id: W_BCA, name: 'BCA', balance: '6000000', isDefault: true, isArchived: false }]),
  };
  const categories = {
    getVisible: jest.fn().mockResolvedValue({ id: 'cat-expense-kos', type: 'EXPENSE' }),
    list: jest.fn().mockResolvedValue([{ id: 'cat-expense-kos', name: 'Kos/Tempat Tinggal' }]),
  };
  const events = new TransactionEvents();
  const periods = fakePeriods(startDay, NOW);
  const service = new BillsService(repo as never, transactions as never, wallets as never, categories as never, periods as never, events);
  service.onModuleInit();
  return { service, repo, transactions, wallets, categories, events };
};

describe('BillsService.create/update', () => {
  it('dueDay = hari dari tanggal jatuh tempo; kategori harus pengeluaran; dompet milik user', async () => {
    const t = build();
    await t.service.create('u1', { name: 'Kos', amount: 3_000_000n, categoryId: 'cat-expense-kos', walletId: W_BCA, intervalMonths: 3, nextDueDate: '2026-11-25', remindDays: [7, 1] });
    expect(t.repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({ dueDay: 25, intervalMonths: 3, nextDueDate: new Date('2026-11-25T00:00:00Z'), walletId: W_BCA }));
    t.categories.getVisible.mockResolvedValue({ id: 'cat-income-gaji', type: 'INCOME' });
    await expect(t.service.create('u1', { name: 'X', amount: 1n, categoryId: 'cat-income-gaji', intervalMonths: 1, nextDueDate: '2026-11-25', remindDays: [] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mengubah jatuh tempo memperbarui dueDay dan menghapus snooze; tagihan milik user lain → 404', async () => {
    const t = build();
    await t.service.update('u1', 'b1', { nextDueDate: '2026-12-31' });
    expect(t.repo.update).toHaveBeenCalledWith('u1', 'b1', expect.objectContaining({ dueDay: 31, snoozedUntil: null }));
    t.repo.findById.mockResolvedValue(null);
    await expect(t.service.update('u1', 'zzz', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BillsService.pay', () => {
  it('Web: EXPENSE dibagi sebanyak interval, bill_id tertaut, langsung CONFIRMED, jatuh tempo maju 3 bulan', async () => {
    const t = build();
    const r = await t.service.pay('u1', 'b1', { date: '2026-10-23' }, 'WEB');
    expect(r.status).toBe('DONE');
    expect(t.transactions.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'EXPENSE', amount: 3_000_000n, spreadPeriods: 3, categoryId: 'cat-expense-kos', walletId: W_BCA, merchant: 'Kos' }),
      { source: 'WEB', status: 'CONFIRMED', billId: 'b1' },
    );
    expect(t.repo.settle).toHaveBeenCalledWith('u1', 'b1', expect.objectContaining({
      transactionId: 'tx1', amount: 3_000_000n, dueDate: new Date('2026-11-25T00:00:00Z'), nextDueDate: new Date('2027-02-25T00:00:00Z'),
    }));
  });

  it('nominal berbeda dipakai untuk transaksi; updateBillAmount memperbarui nominal tagihan', async () => {
    const t = build();
    await t.service.pay('u1', 'b1', { amount: 3_300_000n, updateBillAmount: true }, 'WEB');
    expect(t.transactions.create.mock.calls[0][1]).toMatchObject({ amount: 3_300_000n });
    expect(t.repo.update).toHaveBeenCalledWith('u1', 'b1', { amount: 3_300_000n });
    const t2 = build();
    await t2.service.pay('u1', 'b1', { amount: 3_300_000n }, 'WEB');
    expect(t2.repo.update).not.toHaveBeenCalled();
  });

  it('dompet: input > dompet tagihan > dompet default; tanpa semuanya → 400', async () => {
    const t = build();
    await t.service.pay('u1', 'b1', {}, 'WEB');
    expect(t.transactions.create.mock.calls[0][1]).toMatchObject({ walletId: W_BCA }); // default
    t.wallets.findDefault.mockResolvedValue(null);
    await expect(t.service.pay('u1', 'b1', {}, 'WEB')).rejects.toBeInstanceOf(BadRequestException);
    t.repo.findById.mockResolvedValue(bill({ walletId: 'w-tagihan' }));
    await t.service.pay('u1', 'b1', {}, 'WEB');
    expect(t.transactions.create.mock.calls[1][1]).toMatchObject({ walletId: 'w-tagihan' });
    await t.service.pay('u1', 'b1', { walletId: 'w-input' }, 'WEB');
    expect(t.transactions.create.mock.calls[2][1]).toMatchObject({ walletId: 'w-input' });
  });

  it('Bot: DRAFT (belum CONFIRMED), jatuh tempo BELUM maju; maju saat draf dikonfirmasi lewat event', async () => {
    const t = build();
    const r = await t.service.pay('u1', 'b1', {}, 'TELEGRAM');
    expect(r).toMatchObject({ status: 'DRAFT', transactionId: 'draft1' });
    expect(t.transactions.createDraft).toHaveBeenCalledWith('u1', expect.objectContaining({ spreadPeriods: 3, billId: 'b1' }), 'TELEGRAM');
    expect(t.repo.settle).not.toHaveBeenCalled();

    await t.events.emitConfirmed('u1', { id: 'draft1', status: 'CONFIRMED', billId: 'b1', amount: '3000000', date: '2026-10-23' } as never);
    expect(t.repo.settle).toHaveBeenCalledWith('u1', 'b1', expect.objectContaining({ transactionId: 'draft1', nextDueDate: new Date('2027-02-25T00:00:00Z') }));
  });

  it('tagihan nonaktif / tanpa kategori → 400 tanpa membuat transaksi', async () => {
    const t = build();
    t.repo.findById.mockResolvedValue(bill({ isActive: false }));
    await expect(t.service.pay('u1', 'b1', {}, 'WEB')).rejects.toBeInstanceOf(BadRequestException);
    t.repo.findById.mockResolvedValue(bill({ categoryId: null }));
    await expect(t.service.pay('u1', 'b1', {}, 'WEB')).rejects.toBeInstanceOf(BadRequestException);
    expect(t.transactions.create).not.toHaveBeenCalled();
  });
});

describe('BillsService.settleForTransaction', () => {
  it('tanpa bill_id atau belum CONFIRMED → tidak melakukan apa pun', async () => {
    const t = build();
    await t.service.settleForTransaction('u1', { id: 'x', status: 'CONFIRMED', billId: null } as never);
    await t.service.settleForTransaction('u1', { id: 'x', status: 'DRAFT', billId: 'b1' } as never);
    expect(t.repo.settle).not.toHaveBeenCalled();
  });

  it('jatuh tempo berikutnya menjepit akhir bulan dan mempertahankan dueDay asli (31 Jan → 28 Feb)', async () => {
    const t = build();
    t.repo.findById.mockResolvedValue(bill({ intervalMonths: 1, dueDay: 31, nextDueDate: new Date('2026-01-31T00:00:00Z') }));
    await t.service.settleForTransaction('u1', { id: 'tx9', status: 'CONFIRMED', billId: 'b1', amount: '100', date: '2026-01-30' } as never);
    expect(t.repo.settle.mock.calls[0][2].nextDueDate).toEqual(new Date('2026-02-28T00:00:00Z'));
  });

  it('idempoten: pembayaran yang sudah tercatat (settle → false) tidak menimbulkan error', async () => {
    const t = build();
    t.repo.settle.mockResolvedValue(false);
    await expect(t.service.settleForTransaction('u1', { id: 'tx1', status: 'CONFIRMED', billId: 'b1', amount: '1', date: '2026-10-23' } as never)).resolves.toBeUndefined();
  });

  it('web: event konfirmasi dan panggilan eksplisit sama-sama aman (dua kali settle, satu efek di DB lewat unique)', async () => {
    const t = build();
    t.repo.settle.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await t.service.pay('u1', 'b1', {}, 'WEB');
    await t.events.emitConfirmed('u1', { id: 'tx1', status: 'CONFIRMED', billId: 'b1', amount: '3000000', date: '2026-10-23' } as never);
    expect(t.repo.settle).toHaveBeenCalledTimes(2);
    expect(t.repo.settle.mock.calls[0][2].transactionId).toBe(t.repo.settle.mock.calls[1][2].transactionId);
  });
});

describe('BillsService.overview (cadangan virtual)', () => {
  it('per periode = nominal/interval (ke atas); terkumpul = periode berlalu sejak pembayaran terakhir; uang bebas = saldo default − cadangan', async () => {
    const t = build();
    // dibayar terakhir Agt 2026 (periode 2026-08), sekarang periode 2026-10 → 2 periode berlalu → 2/3 × 3jt = 2jt
    t.repo.lastPaidOn.mockResolvedValue(new Map([['b1', new Date('2026-08-20T00:00:00Z')]]));
    const o = await t.service.overview('u1');
    expect(o.bills[0]).toMatchObject({ reservePerPeriod: '1000000', accumulated: '2000000', lastPaidOn: '2026-08-20', status: 'OK' });
    expect(o.totalReserve).toBe('2000000');
    expect(o.totalPerPeriod).toBe('1000000');
    expect(o.freeMoney).toBe('4000000'); // 6jt − 2jt
    expect(o.defaultWallet).toMatchObject({ name: 'BCA' });
  });

  it('belum pernah dibayar: dihitung sejak tagihan dibuat; maksimal sebesar interval periode', async () => {
    const t = build();
    t.repo.list.mockResolvedValue([bill({ createdAt: new Date('2025-01-01T00:00:00Z') })]);
    expect((await t.service.overview('u1')).bills[0].accumulated).toBe('3000000'); // berlalu > 3 periode → penuh
  });

  it('status: lewat jatuh tempo, dalam 7 hari, aman, nonaktif; tanpa dompet default → freeMoney null', async () => {
    const t = build();
    t.repo.list.mockResolvedValue([
      bill({ id: 'o', nextDueDate: new Date('2026-10-20T00:00:00Z') }),
      bill({ id: 's', nextDueDate: new Date('2026-10-30T00:00:00Z') }),
      bill({ id: 'k', nextDueDate: new Date('2026-12-30T00:00:00Z') }),
      bill({ id: 'n', isActive: false }),
    ]);
    t.wallets.list.mockResolvedValue([{ id: W_BCA, name: 'BCA', balance: '1', isDefault: false, isArchived: false }]);
    const o = await t.service.overview('u1');
    expect(o.bills.map((b) => [b.id, b.status])).toEqual([['o', 'OVERDUE'], ['s', 'DUE_SOON'], ['k', 'OK'], ['n', 'INACTIVE']]);
    expect(o.freeMoney).toBeNull();
  });

  it('startDay 25: periode berlalu dihitung dengan kunci periode gajian', async () => {
    const t = build(25);
    t.repo.lastPaidOn.mockResolvedValue(new Map([['b1', new Date('2026-09-26T00:00:00Z')]])); // 26 Sep → periode 2026-10
    // sekarang 23 Okt → periode 2026-10 → 0 periode berlalu
    expect((await t.service.overview('u1')).bills[0].accumulated).toBe('0');
  });

  it('cadangan per kategori untuk pos alokasi', async () => {
    const t = build();
    t.repo.list.mockResolvedValue([bill(), bill({ id: 'b2', amount: 1_200_000n, intervalMonths: 1 }), bill({ id: 'b3', categoryId: null })]);
    const m = await t.service.reservePerPeriodByCategory('u1');
    expect(m.get('cat-expense-kos')).toBe(2_200_000n); // 1jt + 1,2jt
    expect(m.size).toBe(1);
  });
});

describe('BillsService.dueReminders', () => {
  const today = new Date('2026-11-18T00:00:00Z');
  it('H-7 dan H-1 sesuai remindDays; hari lain tidak', async () => {
    const t = build();
    t.repo.findRemindable.mockResolvedValue([
      bill({ id: 'h7', nextDueDate: new Date('2026-11-25T00:00:00Z') }), // 7 hari
      bill({ id: 'h1', nextDueDate: new Date('2026-11-19T00:00:00Z') }), // 1 hari
      bill({ id: 'h3', nextDueDate: new Date('2026-11-21T00:00:00Z') }), // 3 hari: bukan pengingat
    ]);
    const r = await t.service.dueReminders(today);
    expect(r.map((x) => [x.bill.id, x.daysBefore, x.snoozed])).toEqual([['h7', 7, false], ['h1', 1, false]]);
  });

  it('snooze ke hari ini → pengingat dengan kunci terpisah; tidak ganda bila H-n juga jatuh hari ini', async () => {
    const t = build();
    t.repo.findSnoozedFor.mockResolvedValue([bill({ id: 'z', nextDueDate: new Date('2026-11-21T00:00:00Z') }), bill({ id: 'h7', nextDueDate: new Date('2026-11-25T00:00:00Z') })]);
    t.repo.findRemindable.mockResolvedValue([bill({ id: 'h7', nextDueDate: new Date('2026-11-25T00:00:00Z') })]);
    const r = await t.service.dueReminders(today);
    expect(r.map((x) => [x.bill.id, x.daysBefore, x.snoozed])).toEqual([['h7', 7, false], ['z', 103, true]]);
  });

  it('snooze: ingatkan besok menyimpan tanggal esok (WIB)', async () => {
    const t = build();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T03:00:00Z'));
    try {
      expect(await t.service.snooze('u1', 'b1')).toBe('2026-10-24');
      expect(t.repo.update).toHaveBeenCalledWith('u1', 'b1', { snoozedUntil: new Date('2026-10-24T00:00:00Z') });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('BillsService.dueInPeriod (untuk checklist gajian)', () => {
  it('tagihan jatuh tempo/lewat di periode = belum; yang sudah dibayar untuk jatuh tempo periode ini = sudah', async () => {
    const t = build();
    t.repo.list.mockResolvedValue([
      bill({ id: 'due', nextDueDate: new Date('2026-10-25T00:00:00Z') }),
      bill({ id: 'paid', nextDueDate: new Date('2027-01-25T00:00:00Z') }), // sudah maju
      bill({ id: 'later', nextDueDate: new Date('2026-12-25T00:00:00Z') }),
    ]);
    t.repo.paymentsDueIn.mockResolvedValue([{ billId: 'paid' }]);
    const r = await t.service.dueInPeriod('u1', new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));
    expect(r.map((x) => [x.bill.id, x.done])).toEqual([['due', false], ['paid', true]]);
  });
});
