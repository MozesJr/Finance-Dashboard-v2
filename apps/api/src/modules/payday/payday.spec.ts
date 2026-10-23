import { BadRequestException, NotFoundException } from '@nestjs/common';
import { fakePeriods } from '../periods/periods.testing';
import { PaydayService } from './payday.service';

const SALARY = { id: 'tx-gaji', amount: 8_000_000n, walletId: 'w-cimb', walletName: 'CIMB - Gaji', date: new Date('2026-10-26T00:00:00Z') };
const POS_DARURAT = '11111111-1111-4111-8111-111111111111';
const POS_INVEST = '22222222-2222-4222-8222-222222222222';
const POS_PERPULUHAN = '33333333-3333-4333-8333-333333333333';
const POS_KEBUTUHAN = '44444444-4444-4444-8444-444444444444';

const reportItem = (over: Record<string, unknown>) => ({
  id: 'p', name: 'Pos', description: null, kind: 'EXPENSE', color: null, icon: null, percent: 10, goalId: null, goalName: null, categoryIds: [],
  dialihkan: false, planned: '800000', realized: '0', remaining: '800000', diff: '0', usedPercent: 0, status: 'BELUM_ADA', ...over,
});

const build = (over: { items?: unknown[]; monthlyIncome?: string; done?: string[]; report?: 'none' | 'ok' } = {}) => {
  const repo = {
    findSalaries: jest.fn().mockResolvedValue([SALARY]),
    listActionKeys: jest.fn().mockResolvedValue(over.done ?? []),
    markAction: jest.fn().mockResolvedValue(true),
    unmarkAction: jest.fn().mockResolvedValue(undefined),
  };
  const items = over.items ?? [
    reportItem({ id: POS_DARURAT, name: 'Dana Darurat', kind: 'SAVING', icon: '🛟', goalId: 'g-darurat', goalName: 'Dana Darurat', planned: '1600000' }),
    reportItem({ id: POS_INVEST, name: 'Investasi', kind: 'SAVING', icon: '📈', goalId: 'g-invest', goalName: 'Investasi', planned: '2000000' }),
    reportItem({ id: POS_PERPULUHAN, name: 'Perpuluhan', kind: 'EXPENSE', icon: '❤️', categoryIds: ['cat-expense-donasi'], planned: '800000' }),
    reportItem({ id: POS_KEBUTUHAN, name: 'Kebutuhan Primer', kind: 'EXPENSE', categoryIds: ['cat-a', 'cat-b'], planned: '3000000' }),
  ];
  const allocation = {
    report: over.report === 'none'
      ? jest.fn().mockRejectedValue(new NotFoundException('Belum ada plan'))
      : jest.fn().mockResolvedValue({ month: '2026-11', phase: 1, monthlyIncome: over.monthlyIncome ?? '8000000', items }),
    updatePlan: jest.fn().mockResolvedValue({}),
  };
  const savings = {
    list: jest.fn().mockResolvedValue([
      { id: 'g-darurat', walletId: 'w-bibit' },
      { id: 'g-invest', walletId: null },
    ]),
    addContribution: jest.fn().mockResolvedValue({}),
  };
  const transactions = {
    createDraft: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
  };
  const periods = fakePeriods(25, new Date('2026-10-28T03:00:00Z')); // periode 2026-11 (25 Okt – 24 Nov)
  const bills = { dueInPeriod: jest.fn().mockResolvedValue([]), pay: jest.fn() };
  const service = new PaydayService(repo as never, allocation as never, savings as never, transactions as never, periods as never, bills as never);
  return { service, repo, allocation, savings, transactions, bills };
};

describe('PaydayService.getChecklist', () => {
  it('tanpa gaji di periode → null', async () => {
    const t = build();
    t.repo.findSalaries.mockResolvedValue([]);
    expect(await t.service.getChecklist('u1')).toBeNull();
  });

  it('memakai rentang periode gajian (25 Okt – 24 Nov) untuk mencari gaji dan laporan alokasi periode itu', async () => {
    const t = build();
    const c = await t.service.getChecklist('u1');
    const [, start, end] = t.repo.findSalaries.mock.calls[0];
    expect([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]).toEqual(['2026-10-25', '2026-11-25']);
    expect(t.allocation.report).toHaveBeenCalledWith('u1', { month: '2026-11' });
    expect(c?.period.label).toBe('Nov 2026 (25 Okt – 24 Nov)');
  });

  it('pos: SAVING (butuh tujuan bila goal tanpa dompet), EXPENSE satu kategori, EXPENSE multi = info saja', async () => {
    const c = await build().service.getChecklist('u1');
    expect(c?.items.map((i) => [i.key, i.kind, i.needsDestination])).toEqual([
      [`s:${POS_DARURAT}`, 'SAVING', false],
      [`s:${POS_INVEST}`, 'SAVING', true],
      [`e:${POS_PERPULUHAN}`, 'EXPENSE_SINGLE', undefined],
      [`i:${POS_KEBUTUHAN}`, 'EXPENSE_INFO', undefined],
    ]);
    expect(c?.salary).toMatchObject({ amount: '8000000', walletName: 'CIMB - Gaji' });
  });

  it('gaji = gaji di rencana → tanpa pos INCOME; beda → ada tawaran perbarui', async () => {
    expect((await build().service.getChecklist('u1'))?.items.some((i) => i.kind === 'INCOME')).toBe(false);
    const c = await build({ monthlyIncome: '7000000' }).service.getChecklist('u1');
    expect(c?.items.at(-1)).toMatchObject({ key: 'inc', kind: 'INCOME', amount: '8000000', planIncome: '7000000' });
  });

  it('item yang sudah dijalankan ditandai done; pos dialihkan/0 dilewati; tanpa rencana → hasPlan false', async () => {
    const t = build({ done: [`s:${POS_DARURAT}`], items: [
      reportItem({ id: POS_DARURAT, name: 'Dana Darurat', kind: 'SAVING', goalId: 'g-darurat', planned: '1600000' }),
      reportItem({ id: POS_INVEST, name: 'Investasi', kind: 'SAVING', goalId: 'g-invest', planned: '0', dialihkan: true }),
    ] });
    const c = await t.service.getChecklist('u1');
    expect(c?.items).toHaveLength(1);
    expect(c?.items[0].done).toBe(true);
    const none = await build({ report: 'none' }).service.getChecklist('u1');
    expect(none).toMatchObject({ hasPlan: false, items: [] });
  });
});

describe('PaydayService.runAction', () => {
  it('Setor: kontribusi + transfer dari dompet gaji ke dompet goal (atomik lewat SavingsService), sekali saja', async () => {
    const t = build();
    const r = await t.service.runAction('u1', { itemKey: `s:${POS_DARURAT}` }, 'TELEGRAM');
    expect(r.status).toBe('DONE');
    expect(t.repo.markAction).toHaveBeenCalledWith('u1', '2026-11', `s:${POS_DARURAT}`);
    expect(t.savings.addContribution).toHaveBeenCalledWith('u1', 'g-darurat', expect.objectContaining({ type: 'DEPOSIT', amount: 1_600_000n, walletId: 'w-cimb' }));
    expect(t.savings.addContribution.mock.calls[0][2]).not.toHaveProperty('counterWalletId');
  });

  it('goal tanpa dompet: wajib pilih tujuan (400, tidak ada yang tertulis); dengan tujuan → counterWalletId', async () => {
    const t = build();
    await expect(t.service.runAction('u1', { itemKey: `s:${POS_INVEST}` }, 'TELEGRAM')).rejects.toBeInstanceOf(BadRequestException);
    expect(t.repo.markAction).not.toHaveBeenCalled();
    expect(t.savings.addContribution).not.toHaveBeenCalled();
    await t.service.runAction('u1', { itemKey: `s:${POS_INVEST}`, destinationWalletId: 'w-ipot' }, 'TELEGRAM');
    expect(t.savings.addContribution).toHaveBeenCalledWith('u1', 'g-invest', expect.objectContaining({ walletId: 'w-cimb', counterWalletId: 'w-ipot' }));
  });

  it('idempoten: item yang sudah done atau bentrok saat klaim → ALREADY tanpa efek samping', async () => {
    const done = build({ done: [`s:${POS_DARURAT}`] });
    expect((await done.service.runAction('u1', { itemKey: `s:${POS_DARURAT}` }, 'TELEGRAM')).status).toBe('ALREADY');
    expect(done.savings.addContribution).not.toHaveBeenCalled();

    const race = build();
    race.repo.markAction.mockResolvedValue(false); // permintaan lain sudah mengklaim
    expect((await race.service.runAction('u1', { itemKey: `s:${POS_DARURAT}` }, 'TELEGRAM')).status).toBe('ALREADY');
    expect(race.savings.addContribution).not.toHaveBeenCalled();
  });

  it('kegagalan aksi mencabut klaim (bisa dicoba lagi) dan melempar error aslinya', async () => {
    const t = build();
    t.savings.addContribution.mockRejectedValue(new BadRequestException('Dompet sumber sama'));
    await expect(t.service.runAction('u1', { itemKey: `s:${POS_DARURAT}` }, 'TELEGRAM')).rejects.toThrow('Dompet sumber sama');
    expect(t.repo.unmarkAction).toHaveBeenCalledWith('u1', '2026-11', `s:${POS_DARURAT}`);
  });

  it('EXPENSE satu kategori: Telegram → DRAFT (belum tersimpan); Web → langsung CONFIRMED', async () => {
    const t = build();
    const bot = await t.service.runAction('u1', { itemKey: `e:${POS_PERPULUHAN}` }, 'TELEGRAM');
    expect(bot).toMatchObject({ status: 'DRAFT', transactionId: 'draft-1' });
    expect(t.transactions.createDraft).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'EXPENSE', walletId: 'w-cimb', categoryId: 'cat-expense-donasi', amount: 800_000n }), 'TELEGRAM');

    const web = build();
    expect((await web.service.runAction('u1', { itemKey: `e:${POS_PERPULUHAN}` }, 'WEB')).status).toBe('DONE');
    expect(web.transactions.create).toHaveBeenCalledWith('u1', expect.objectContaining({ categoryId: 'cat-expense-donasi' }), { source: 'WEB', status: 'CONFIRMED' });
  });

  it('INCOME: memperbarui gaji di rencana ke nominal gaji diterima', async () => {
    const t = build({ monthlyIncome: '7000000' });
    expect((await t.service.runAction('u1', { itemKey: 'inc' }, 'WEB')).status).toBe('DONE');
    expect(t.allocation.updatePlan).toHaveBeenCalledWith('u1', { monthlyIncome: 8_000_000n });
  });

  it('pos info / tidak dikenal → 404; tanpa gaji → 404', async () => {
    const t = build();
    await expect(t.service.runAction('u1', { itemKey: `i:${POS_KEBUTUHAN}` }, 'WEB')).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.runAction('u1', { itemKey: 'x:y' }, 'WEB')).rejects.toBeInstanceOf(NotFoundException);
    t.repo.findSalaries.mockResolvedValue([]);
    await expect(t.service.runAction('u1', { itemKey: 'inc' }, 'WEB')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('claimNotification meneruskan kunci n:<txId> (satu notifikasi per gaji)', async () => {
    const t = build();
    await t.service.claimNotification('u1', '2026-11', 'tx-gaji');
    expect(t.repo.markAction).toHaveBeenCalledWith('u1', '2026-11', 'n:tx-gaji');
  });
});
