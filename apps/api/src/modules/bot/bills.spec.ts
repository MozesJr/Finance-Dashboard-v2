import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillRemindersJob } from './jobs/bill-reminders.job';
import { BillsHandler, renderReminder } from './core/handlers/bills.handler';
import { renderChecklist } from './core/handlers/payday.handler';

const view = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Kos', amount: '3000000', categoryId: 'cat-expense-kos', categoryName: 'Kos', walletId: null, walletName: null,
  payWalletName: 'CIMB - Gaji', intervalMonths: 3, nextDueDate: '2026-11-25', isActive: true, remindDays: [7, 1], snoozedUntil: null, daysUntilDue: 7,
  status: 'DUE_SOON', reservePerPeriod: '1000000', accumulated: '2000000', lastPaidOn: null, ...over,
});

describe('renderReminder', () => {
  it('H-7: nama, nominal, tanggal, tombol Bayar dari dompet dan Ingatkan besok; info pembagian bila interval > 1', () => {
    const m = renderReminder(view() as never, 7, false);
    expect(m.text).toContain('🧾 Pengingat tagihan');
    expect(m.text).toContain('Kos Rp3.000.000 jatuh tempo 25 Nov 2026 (H-7).');
    expect(m.text).toContain('Dibagi ke 3 periode');
    expect((m.buttons ?? []).flat().map((b) => [b.text, b.data])).toEqual([
      ['Bayar sekarang dari CIMB - Gaji', 'bp:11111111-1111-4111-8111-111111111111'],
      ['Ingatkan besok', 'bz:11111111-1111-4111-8111-111111111111'],
    ]);
  });

  it('hari-H, lewat, dan ditunda; data callback < 64 byte', () => {
    expect(renderReminder(view() as never, 0, false).text).toContain('(hari ini)');
    expect(renderReminder(view() as never, -2, false).text).toContain('sudah lewat 2 hari');
    expect(renderReminder(view({ intervalMonths: 1 }) as never, 1, true).text).toContain('⏰ Pengingat tagihan (ditunda)');
    (renderReminder(view() as never, 1, false).buttons ?? []).flat().forEach((b) => expect(Buffer.byteLength(b.data)).toBeLessThan(64));
  });
});

describe('BillsHandler', () => {
  const user = { userId: 'u1', chatId: 'c1', channel: 'TELEGRAM' as const };
  const build = () => {
    const bills = {
      overview: jest.fn().mockResolvedValue({
        bills: [view({ daysUntilDue: 3, nextDueDate: '2026-10-26' }), view({ id: 'b2', name: 'Internet', amount: '350000', intervalMonths: 1, daysUntilDue: -2, nextDueDate: '2026-10-21' })],
        totalReserve: '2000000', totalPerPeriod: '1350000', defaultWallet: { id: 'w', name: 'CIMB - Gaji', balance: '9000000' }, freeMoney: '7000000',
      }),
      pay: jest.fn().mockResolvedValue({ status: 'DRAFT', transactionId: 'draft-1', message: 'Draft Kos dibuat.' }),
      snooze: jest.fn().mockResolvedValue('2026-10-24'),
    };
    const transactions = { get: jest.fn().mockResolvedValue({ id: 'draft-1', type: 'EXPENSE', amount: '3000000', date: '2026-10-23', merchant: 'Kos', wallet: { name: 'CIMB - Gaji' }, toWallet: null, category: { name: 'Kos', icon: null }, aiConfidence: null, spreadPeriods: 3 }) };
    return { handler: new BillsHandler(bills as never, transactions as never), bills, transactions };
  };

  it('/tagihan: daftar terdekat, lewat jatuh tempo, cadangan, dan uang bebas', async () => {
    const [m] = await build().handler.list(user);
    expect(m.message.text).toContain('Kos Rp3.000.000 /3 bln — 26 Okt 2026 (3 hari lagi)');
    expect(m.message.text).toContain('Internet Rp350.000 — 21 Okt 2026 (lewat 2 hari)');
    expect(m.message.text).toContain('Cadangan seharusnya: Rp2.000.000 (sisihkan Rp1.350.000/periode)');
    expect(m.message.text).toContain('Uang bebas di CIMB - Gaji: Rp7.000.000');
  });

  it('/tagihan tanpa tagihan → petunjuk', async () => {
    const t = build();
    t.bills.overview.mockResolvedValue({ bills: [] });
    expect((await t.handler.list(user))[0].message.text).toContain('Belum ada tagihan berkala');
  });

  it('Bayar sekarang → DRAFT dengan preview + Simpan (tagihan belum dianggap dibayar)', async () => {
    const t = build();
    const replies = await t.handler.callback(user, 'bp:11111111-1111-4111-8111-111111111111');
    expect(t.bills.pay).toHaveBeenCalledWith('u1', '11111111-1111-4111-8111-111111111111', {}, 'TELEGRAM');
    expect(replies[0].mode).toBe('edit');
    expect(replies[1].message.text).toContain('Draft transaksi');
    expect(replies[1].message.text).toContain('Dibagi ke 3 periode');
    expect((replies[1].message.buttons ?? []).flat().some((b) => b.text.includes('Simpan'))).toBe(true);
  });

  it('Ingatkan besok → snooze; tagihan hilang → pesan ramah; error → ⚠️', async () => {
    const t = build();
    expect((await t.handler.callback(user, 'bz:11111111-1111-4111-8111-111111111111'))[0].message.text).toContain('besok pagi');
    expect(t.bills.snooze).toHaveBeenCalled();
    t.bills.pay.mockRejectedValueOnce(new NotFoundException());
    expect((await t.handler.callback(user, 'bp:x'))[0].message.text).toContain('sudah tidak ada');
    t.bills.pay.mockRejectedValueOnce(new BadRequestException('Pilih dompet pembayaran'));
    expect((await t.handler.callback(user, 'bp:y'))[0].message.text).toContain('⚠️ Pilih dompet pembayaran');
    expect((await t.handler.callback(user, 'bp'))[0].message.text).toContain('tidak berlaku');
  });
});

describe('BillRemindersJob (idempoten)', () => {
  const today = new Date('2026-11-18T00:00:00Z');
  const r = (over: Record<string, unknown> = {}) => ({ bill: { id: 'b1', userId: 'u1', nextDueDate: new Date('2026-11-25T00:00:00Z') }, daysBefore: 7, daysLeft: 7, snoozed: false, ...over });
  const build = (reminders: unknown[] = [r()]) => {
    const bills = {
      dueReminders: jest.fn().mockResolvedValue(reminders),
      claimReminder: jest.fn().mockResolvedValue(true),
      releaseReminder: jest.fn().mockResolvedValue(undefined),
      clearSnooze: jest.fn().mockResolvedValue(undefined),
      describe: jest.fn().mockResolvedValue(view()),
    };
    const notifier = { notifyUser: jest.fn().mockResolvedValue(true) };
    return { job: new BillRemindersJob(bills as never, notifier as never), bills, notifier };
  };

  it('klaim → kirim pesan dengan tombol; hasil terhitung', async () => {
    const t = build();
    expect(await t.job.run(today)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(t.bills.claimReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), 7);
    expect(t.notifier.notifyUser.mock.calls[0][0]).toBe('u1');
    expect(t.notifier.notifyUser.mock.calls[0][1].text).toContain('(H-7)');
  });

  it('dijalankan dua kali: klaim ditolak (sudah ada) → tidak mengirim lagi', async () => {
    const t = build();
    expect(await t.job.run(today)).toMatchObject({ sent: 1 });
    t.bills.claimReminder.mockResolvedValue(false);
    expect(await t.job.run(today)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(t.notifier.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('pengiriman gagal (user belum terhubung/bot mati) → klaim dilepas supaya bisa dicoba lagi', async () => {
    const t = build();
    t.notifier.notifyUser.mockResolvedValue(false);
    expect(await t.job.run(today)).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(t.bills.releaseReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), 7);
  });

  it('pengingat tunda: setelah terkirim, snooze dibersihkan; error satu tagihan tidak menghentikan yang lain', async () => {
    const t = build([r({ snoozed: true, daysBefore: 103, daysLeft: 3 }), r({ bill: { id: 'b2', userId: 'u1', nextDueDate: new Date('2026-11-19T00:00:00Z') }, daysBefore: 1, daysLeft: 1 })]);
    t.bills.describe.mockRejectedValueOnce(new Error('db')).mockResolvedValue(view());
    const res = await t.job.run(today);
    expect(res).toEqual({ sent: 1, skipped: 0, failed: 1 });
    t.bills.describe.mockResolvedValue(view());
    const t2 = build([r({ snoozed: true, daysBefore: 103, daysLeft: 3 })]);
    await t2.job.run(today);
    expect(t2.bills.clearSnooze).toHaveBeenCalled();
  });

  it('tanpa pengingat → tidak ada pengiriman', async () => {
    const t = build([]);
    expect(await t.job.run(today)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(t.notifier.notifyUser).not.toHaveBeenCalled();
  });
});

describe('renderChecklist: tagihan jatuh tempo', () => {
  const c = {
    period: { key: '2026-11', label: 'Nov 2026 (25 Okt – 24 Nov)', start: '2026-10-25', end: '2026-11-24' },
    salary: { id: 's', amount: '8000000', walletId: 'w', walletName: 'CIMB - Gaji', date: '2026-10-26' },
    hasPlan: true, phase: 1,
    items: [
      { key: 't:11111111-1111-4111-8111-111111111111', kind: 'BILL' as const, name: 'Kos', icon: '🧾', amount: '3000000', done: false, billId: '11111111-1111-4111-8111-111111111111', dueDate: '2026-11-25' },
      { key: 't:22222222-2222-4222-8222-222222222222', kind: 'BILL' as const, name: 'Internet', icon: '🧾', amount: '350000', done: true, billId: '22222222-2222-4222-8222-222222222222', dueDate: '2026-11-10' },
    ],
  };

  it('tagihan tampil dengan tombol Bayar; yang sudah dibayar "✅ Sudah"; callback tidak bentrok dengan "kembali"', () => {
    const m = renderChecklist(c);
    expect(m.text).toContain('• 🧾 Kos: Rp3.000.000 (jatuh tempo 2026-11-25)');
    expect((m.buttons ?? []).flat().map((b) => b.text)).toEqual(['Bayar Kos Rp3.000.000', '✅ Sudah']);
    expect((m.buttons ?? []).flat()[0].data).toBe('pd:t:11111111-1111-4111-8111-111111111111:2611');
  });
});
