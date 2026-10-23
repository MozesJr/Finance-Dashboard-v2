import { describe, it, expect } from 'vitest';
import { isQuestion, shouldRouteToChat } from './question';

describe('isQuestion', () => {
  it.each([
    'berapa pengeluaran saya bulan ini',
    'Apa kategori terbesar',
    'kapan terakhir saya beli bensin',
    'kenapa pengeluaran naik',
    'gimana kondisi tabungan',
    'piye saldo ku',
    'pinten pengeluaran minggu iki',
    'siapa yang paling sering',
    'di mana saya paling boros',
    'saldo bca cukup?',
    'dana darurat sudah berapa persen ?',
  ])('pertanyaan: %s', (t) => expect(isQuestion(t)).toBe(true));

  it.each(['makan siang 35rb', 'gaji 8,5jt', 'bensin 20k', 'apalah', 'berapakah', '', '   ', 'transfer 500rb bca ke gopay'])(
    'bukan pertanyaan: "%s"',
    (t) => expect(isQuestion(t)).toBe(false),
  );
});

describe('shouldRouteToChat', () => {
  it('pertanyaan tanpa nominal tegas → chat (angka polos seperti tahun tidak dihitung)', () => {
    expect(shouldRouteToChat('berapa pengeluaran bulan oktober 2026?')).toBe(true);
    expect(shouldRouteToChat('apa saja transaksi tanggal 12')).toBe(true);
  });

  it('memuat nominal tegas → tetap diproses sebagai transaksi', () => {
    expect(shouldRouteToChat('apa ini beli kopi 35rb')).toBe(false);
    expect(shouldRouteToChat('berapa? bayar Rp 50.000')).toBe(false);
    expect(shouldRouteToChat('kopi 1,2jt?')).toBe(false);
  });

  it('bukan pertanyaan → false', () => {
    expect(shouldRouteToChat('makan siang')).toBe(false);
  });
});
