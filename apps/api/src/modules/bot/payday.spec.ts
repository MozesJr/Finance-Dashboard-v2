import { Checklist } from '../payday/payday.service';
import { PaydayNotifier } from './payday-notifier';
import { PaydayHandler, renderChecklist } from './core/handlers/payday.handler';
import { TransactionEvents } from '../transactions/transaction-events';

const POS_A = '11111111-1111-4111-8111-111111111111';
const POS_B = '22222222-2222-4222-8222-222222222222';
const POS_C = '33333333-3333-4333-8333-333333333333';

const checklist = (over: Partial<Checklist> = {}): Checklist => ({
  period: { key: '2026-11', label: 'Nov 2026 (25 Okt – 24 Nov)', start: '2026-10-25', end: '2026-11-24' },
  salary: { id: 'tx-gaji', amount: '8000000', walletId: 'w-cimb', walletName: 'CIMB - Gaji', date: '2026-10-26' },
  hasPlan: true,
  phase: 1,
  items: [
    { key: `s:${POS_A}`, kind: 'SAVING', name: 'Dana Darurat', icon: '🛟', amount: '1600000', done: false, goalId: 'g1', goalName: 'Dana Darurat', needsDestination: false },
    { key: `s:${POS_B}`, kind: 'SAVING', name: 'Investasi', icon: '📈', amount: '2000000', done: false, goalId: 'g2', goalName: 'Investasi', needsDestination: true },
    { key: `e:${POS_C}`, kind: 'EXPENSE_SINGLE', name: 'Perpuluhan', icon: '❤️', amount: '800000', done: true, categoryId: 'cat-donasi' },
    { key: 'i:44444444-4444-4444-8444-444444444444', kind: 'EXPENSE_INFO', name: 'Kebutuhan Primer', icon: null, amount: '3000000', done: false },
    { key: 'inc', kind: 'INCOME', name: 'Perbarui gaji di alokasi', icon: null, amount: '8000000', planIncome: '7000000', done: false },
  ],
  ...over,
});

describe('renderChecklist', () => {
  it('judul periode + gaji, pos dengan tombol, info multi-kategori tanpa tombol, yang sudah → "✅ Sudah"', () => {
    const m = renderChecklist(checklist());
    expect(m.text).toContain('💰 Gaji diterima — alokasi periode Nov 2026 (25 Okt – 24 Nov)');
    expect(m.text).toContain('Gaji Rp8.000.000 masuk ke CIMB - Gaji.');
    expect(m.text).toContain('ℹ️ Kebutuhan Primer: anggaran Rp3.000.000 (beberapa kategori)');
    expect(m.text).toContain('⚠️ Gaji di alokasi Rp7.000.000 ≠ gaji diterima Rp8.000.000');
    const texts = (m.buttons ?? []).flat().map((b) => b.text);
    expect(texts).toEqual(['Setor Dana Darurat Rp1.600.000', 'Setor Investasi Rp2.000.000', '✅ Sudah', 'Perbarui gaji di alokasi ke Rp8.000.000']);
  });

  it('semua data callback < 64 byte dan berformat pd:<kode>:<id>:<yymm>', () => {
    const data = (renderChecklist(checklist()).buttons ?? []).flat().map((b) => b.data);
    expect(data).toEqual([`pd:s:${POS_A}:2611`, `pd:s:${POS_B}:2611`, `pd:e:${POS_C}:2611`, 'pd:n:x:2611']);
    data.forEach((d) => expect(Buffer.byteLength(d)).toBeLessThan(64));
  });

  it('tanpa rencana alokasi → petunjuk, tanpa tombol', () => {
    const m = renderChecklist(checklist({ hasPlan: false, items: [] }));
    expect(m.text).toContain('Belum ada rencana alokasi');
    expect(m.buttons).toHaveLength(0);
  });
});

describe('PaydayHandler.callback', () => {
  const user = { userId: 'u1', chatId: 'c1', channel: 'TELEGRAM' as const };
  const build = (c: Checklist | null = checklist()) => {
    const payday = {
      getChecklist: jest.fn().mockResolvedValue(c),
      runAction: jest.fn().mockResolvedValue({ status: 'DONE', message: 'Setor Rp1.600.000 ke Dana Darurat dari CIMB - Gaji.' }),
    };
    const transactions = { get: jest.fn().mockResolvedValue({ id: 'draft-1', type: 'EXPENSE', amount: '800000', date: '2026-10-28', merchant: 'Perpuluhan', wallet: { name: 'CIMB - Gaji' }, toWallet: null, category: { name: 'Donasi', icon: null }, aiConfidence: null }) };
    const wallets = { list: jest.fn().mockResolvedValue([{ id: 'w-cimb', name: 'CIMB - Gaji', balance: '8000000' }, { id: 'w-ipot', name: 'Ipot', balance: '5000000' }]) };
    return { handler: new PaydayHandler(payday as never, transactions as never, wallets as never), payday, transactions, wallets };
  };

  it('Setor goal berdompet: menjalankan aksi lalu mengedit pesan dengan ✅', async () => {
    const t = build();
    const [r] = await t.handler.callback(user, `pd:s:${POS_A}:2611`);
    expect(t.payday.runAction).toHaveBeenCalledWith('u1', { itemKey: `s:${POS_A}`, periodKey: '2026-11', destinationWalletId: null }, 'TELEGRAM');
    expect(r.mode).toBe('edit');
    expect(r.message.text).toContain('✅ Setor Rp1.600.000 ke Dana Darurat');
  });

  it('goal tanpa dompet: menampilkan pemilih dompet (tanpa dompet gaji); memilih → aksi dengan destinationWalletId', async () => {
    const t = build();
    const [picker] = await t.handler.callback(user, `pd:s:${POS_B}:2611`);
    expect(t.payday.runAction).not.toHaveBeenCalled();
    expect(picker.message.text).toContain('Simpan di dompet mana?');
    const buttons = (picker.message.buttons ?? []).flat();
    expect(buttons.map((b) => b.text)).toEqual(['Ipot (Rp5.000.000)', '↩ Kembali']);
    await t.handler.callback(user, buttons[0].data);
    expect(t.payday.runAction).toHaveBeenCalledWith('u1', { itemKey: `s:${POS_B}`, periodKey: '2026-11', destinationWalletId: 'w-ipot' }, 'TELEGRAM');
  });

  it('Catat pos pengeluaran: hasilnya DRAFT → ada pesan preview draft dengan tombol Simpan', async () => {
    const t = build(checklist({ items: [{ key: `e:${POS_C}`, kind: 'EXPENSE_SINGLE', name: 'Perpuluhan', icon: null, amount: '800000', done: false, categoryId: 'cat-donasi' }] }));
    t.payday.runAction.mockResolvedValue({ status: 'DRAFT', message: 'Draft Perpuluhan Rp800.000 dibuat.', transactionId: 'draft-1' });
    const replies = await t.handler.callback(user, `pd:e:${POS_C}:2611`);
    expect(replies).toHaveLength(2);
    expect(replies[1].mode).toBe('send');
    expect(replies[1].message.text).toContain('Draft transaksi');
    expect((replies[1].message.buttons ?? []).flat().some((b) => b.text.includes('Simpan'))).toBe(true);
  });

  it('tombol yang sudah dijalankan → ALREADY ditampilkan ramah, tidak ada draft baru', async () => {
    const t = build();
    t.payday.runAction.mockResolvedValue({ status: 'ALREADY', message: 'Perpuluhan sudah dijalankan.' });
    const replies = await t.handler.callback(user, `pd:e:${POS_C}:2611`);
    expect(replies).toHaveLength(1);
    expect(replies[0].message.text).toContain('ℹ️ Perpuluhan sudah dijalankan.');
  });

  it('data rusak / pos sudah tidak ada / gaji hilang → pesan aman, tanpa aksi', async () => {
    const t = build();
    expect((await t.handler.callback(user, 'pd:s:x:abc'))[0].message.text).toContain('sudah tidak berlaku');
    expect((await t.handler.callback(user, 'pd:s:99999999-9999-4999-8999-999999999999:2611'))[0].message.text).toContain('sudah tidak ada');
    const none = build(null);
    expect((await none.handler.callback(user, `pd:s:${POS_A}:2611`))[0].message.text).toContain('tidak ada');
    expect(t.payday.runAction).not.toHaveBeenCalled();
  });

  it('error aksi ditampilkan ramah (⚠️) tanpa melempar', async () => {
    const t = build();
    t.payday.runAction.mockRejectedValue(new Error('Dompet sumber sama'));
    expect((await t.handler.callback(user, `pd:s:${POS_A}:2611`))[0].message.text).toContain('⚠️');
  });
});

describe('PaydayNotifier', () => {
  const build = (claim = true) => {
    const events = new TransactionEvents();
    const payday = { claimNotification: jest.fn().mockResolvedValue(claim), getChecklist: jest.fn().mockResolvedValue(checklist()) };
    const periods = { forDate: jest.fn().mockResolvedValue({ key: '2026-11' }) };
    const notifier = { notifyUser: jest.fn().mockResolvedValue(true) };
    const n = new PaydayNotifier(events as never, payday as never, periods as never, notifier as never);
    n.onModuleInit();
    return { events, payday, notifier, n };
  };
  const salaryTx = { id: 'tx-gaji', type: 'INCOME', categoryId: 'cat-income-gaji', date: '2026-10-26', status: 'CONFIRMED' } as never;

  it('gaji CONFIRMED → satu pesan checklist dikirim ke user', async () => {
    const t = build();
    await t.events.emitConfirmed('u1', salaryTx);
    expect(t.payday.claimNotification).toHaveBeenCalledWith('u1', '2026-11', 'tx-gaji');
    expect(t.notifier.notifyUser).toHaveBeenCalledTimes(1);
    expect(t.notifier.notifyUser.mock.calls[0][1].text).toContain('Gaji diterima');
  });

  it('idempoten: klaim sudah ada → tidak mengirim lagi', async () => {
    const t = build(false);
    await t.events.emitConfirmed('u1', salaryTx);
    expect(t.notifier.notifyUser).not.toHaveBeenCalled();
  });

  it('bukan gaji (kategori lain / pengeluaran) → diabaikan', async () => {
    const t = build();
    await t.events.emitConfirmed('u1', { ...(salaryTx as object), categoryId: 'cat-income-bonus' } as never);
    await t.events.emitConfirmed('u1', { ...(salaryTx as object), type: 'EXPENSE' } as never);
    expect(t.payday.claimNotification).not.toHaveBeenCalled();
  });
});
