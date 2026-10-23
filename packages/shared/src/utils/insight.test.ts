import { describe, it, expect } from 'vitest';
import { extractRupiahAmounts, validateNarrativeNumbers } from './insight';

const values = (text: string) => extractRupiahAmounts(text).map((m) => m.value);

describe('extractRupiahAmounts', () => {
  it('format Rp dengan titik ribuan', () => {
    expect(values('Pengeluaran Rp1.287.500 bulan ini')).toEqual([1_287_500n]);
    expect(values('Rp 35.000 dan Rp50000')).toEqual([35_000n, 50_000n]);
  });

  it('satuan juta/ribu dengan desimal koma', () => {
    expect(values('sekitar Rp1,3 juta')).toEqual([1_300_000n]);
    expect(values('350 ribu, 2jt, Rp1,25jt, 75rb')).toEqual([350_000n, 2_000_000n, 1_250_000n, 75_000n]);
    expect(values('1,5 miliar')).toEqual([1_500_000_000n]);
  });

  it('toleransi mengikuti ketelitian yang ditulis', () => {
    expect(extractRupiahAmounts('Rp1,3 juta')[0].tolerance).toBe(50_000n);
    expect(extractRupiahAmounts('350 ribu')[0].tolerance).toBe(500n);
    expect(extractRupiahAmounts('Rp1.287.500')[0].tolerance).toBe(0n);
  });

  it('angka biasa (bulan, persen, tahun, tanggal) diabaikan', () => {
    expect(values('naik 41% selama 3 bulan di 2026, tanggal 12')).toEqual([]);
  });

  it('angka bertitik ribuan tanpa "Rp" tetap dihitung', () => {
    expect(values('totalnya 1.287.500 saja')).toEqual([1_287_500n]);
  });
});

describe('validateNarrativeNumbers', () => {
  const allowed = [1_287_500n, 250_000n, 5_000_000n];

  it('nominal persis atau pembulatan wajar → ok', () => {
    expect(validateNarrativeNumbers(['Pengeluaran Rp1.287.500'], allowed).ok).toBe(true);
    expect(validateNarrativeNumbers(['sekitar Rp1,3 juta'], allowed).ok).toBe(true);
    expect(validateNarrativeNumbers(['Rp250 ribu dan 5 juta'], allowed).ok).toBe(true);
  });

  it('angka yang tidak ada di statistik (karangan/hasil hitung sendiri) → tidak ok, daftar disebut', () => {
    const r = validateNarrativeNumbers(['Pengeluaran Rp1.300.000', 'hemat Rp500 ribu'], allowed);
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(['Rp1.300.000', 'Rp500 ribu']);
  });

  it('pembulatan terlalu longgar ditolak ("Rp1,4 juta" ≠ 1.287.500)', () => {
    expect(validateNarrativeNumbers(['Rp1,4 juta'], allowed).ok).toBe(false);
  });

  it('teks tanpa nominal selalu ok', () => {
    expect(validateNarrativeNumbers(['Pengeluaran naik 41% dibanding rata-rata 3 bulan.'], allowed).ok).toBe(true);
  });
});
