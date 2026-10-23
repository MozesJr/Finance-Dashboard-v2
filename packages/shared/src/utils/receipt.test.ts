import { describe, it, expect } from 'vitest';
import type { ReceiptExtraction } from '../schemas/ai';
import { sanitizeReceipt } from './receipt';
import { matchWalletByText } from './tx-parser';

const base: ReceiptExtraction = {
  merchant: 'BreadTalk',
  date: '2019-05-10',
  total: 43_500,
  items: [
    { name: 'Bread Butter Pudding', qty: 1, price: 11_500 },
    { name: 'Cream Brulee', qty: 1, price: 14_000 },
    { name: 'Choco Croissant', qty: 1, price: 10_500 },
    { name: 'Bank Of Chocolat', qty: 1, price: 7_500 },
  ],
  paymentMethod: 'Debit BCA',
};

describe('sanitizeReceipt', () => {
  it('struk wajar: total BigInt, tanpa catatan (jumlah item = total)', () => {
    const r = sanitizeReceipt(base, '2026-10-23');
    expect(r.ok && r.receipt).toMatchObject({ merchant: 'BreadTalk', date: '2019-05-10', total: 43_500n, notes: [] });
  });

  it('total 0 / negatif → gagal dengan pesan jelas', () => {
    for (const total of [0, -5]) {
      const r = sanitizeReceipt({ ...base, total }, '2026-10-23');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('Total pada struk tidak terbaca');
    }
  });

  it('tanggal di masa depan → hari ini + catatan; tanggal kosong → hari ini + catatan', () => {
    const future = sanitizeReceipt({ ...base, date: '2027-01-01' }, '2026-10-23');
    expect(future.ok && future.receipt.date).toBe('2026-10-23');
    expect(future.ok && future.receipt.notes[0]).toContain('masa depan');
    const none = sanitizeReceipt({ ...base, date: null }, '2026-10-23');
    expect(none.ok && none.receipt.date).toBe('2026-10-23');
    expect(none.ok && none.receipt.notes[0]).toContain('tidak terbaca');
  });

  it('selisih item vs total ≤ 5% tanpa catatan; > 5% diberi catatan tetapi total tetap dipakai', () => {
    const within = sanitizeReceipt({ ...base, total: 45_000 }, '2026-10-23'); // selisih 1.500 = 3,3%
    expect(within.ok && within.receipt.notes).toEqual([]);
    const over = sanitizeReceipt({ ...base, total: 50_000 }, '2026-10-23'); // selisih 6.500 = 13%
    expect(over.ok && over.receipt.total).toBe(50_000n);
    expect(over.ok && over.receipt.notes[0]).toContain('Jumlah item');
  });

  it('tanpa item tidak ada catatan selisih; merchant kosong → null', () => {
    const r = sanitizeReceipt({ ...base, items: [], merchant: '   ' }, '2026-10-23');
    expect(r.ok && r.receipt).toMatchObject({ merchant: null, notes: [] });
  });
});

describe('matchWalletByText', () => {
  const wallets = [
    { id: 'w-bca', name: 'BCA' },
    { id: 'w-tunai', name: 'Dompet Tunai' },
  ];
  it('mengenali dompet dari metode pembayaran', () => {
    expect(matchWalletByText('Debit BCA', wallets)).toBe('w-bca');
    expect(matchWalletByText('CASH', wallets)).toBe('w-tunai');
    expect(matchWalletByText('QRIS', wallets)).toBeNull();
    expect(matchWalletByText('', wallets)).toBeNull();
  });
});
