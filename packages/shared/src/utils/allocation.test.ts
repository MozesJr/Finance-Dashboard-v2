import { describe, it, expect } from 'vitest';
import { splitByPercent } from './allocation';
import { PutPhaseItemsSchema } from '../schemas/allocation';

const sum = (a: bigint[]) => a.reduce((x, y) => x + y, 0n);

describe('splitByPercent', () => {
  const phase1 = [
    { percent: 10, sortOrder: 0 },
    { percent: 45, sortOrder: 1 },
    { percent: 15, sortOrder: 2 },
    { percent: 15, sortOrder: 3 },
    { percent: 15, sortOrder: 4 },
  ];

  it('membagi tepat bila habis dibagi', () => {
    expect(splitByPercent(10_000_000n, phase1)).toEqual([1_000_000n, 4_500_000n, 1_500_000n, 1_500_000n, 1_500_000n]);
  });

  it('total selalu persis, sisa pembulatan ke item terbesar', () => {
    const total = 1_234_567n;
    const result = splitByPercent(total, phase1);
    expect(sum(result)).toBe(total);
    // floor: 10%→123456, 45%→555555, 15%→185185 (x3) = 1234566 → sisa 1 ke pos 45%
    expect(result).toEqual([123_456n, 555_556n, 185_185n, 185_185n, 185_185n]);
  });

  it('seri persen terbesar → sortOrder terkecil', () => {
    const result = splitByPercent(101n, [
      { percent: 50, sortOrder: 2 },
      { percent: 50, sortOrder: 1 },
    ]);
    expect(result).toEqual([50n, 51n]);
    expect(sum(result)).toBe(101n);
  });

  it('item 0% mendapat 0 dan tidak mengambil sisa', () => {
    const result = splitByPercent(999n, [
      { percent: 0, sortOrder: 0 },
      { percent: 70, sortOrder: 1 },
      { percent: 30, sortOrder: 2 },
    ]);
    expect(result[0]).toBe(0n);
    expect(sum(result)).toBe(999n);
  });

  it('nominal besar tetap exact (BigInt)', () => {
    const total = 9_007_199_254_740_993n;
    expect(sum(splitByPercent(total, phase1))).toBe(total);
  });
});

describe('PutPhaseItemsSchema', () => {
  const expense = (name: string, percent: number, categoryIds: string[]) => ({ name, kind: 'EXPENSE' as const, percent, categoryIds });
  const saving = (name: string, percent: number) => ({ name, kind: 'SAVING' as const, percent, goalId: '11111111-1111-4111-8111-111111111111' });

  it('menerima total 100', () => {
    expect(PutPhaseItemsSchema.safeParse({ items: [expense('A', 60, ['c1']), saving('B', 40)] }).success).toBe(true);
  });

  it('menolak total ≠ 100 dengan pesan yang menyebut totalnya', () => {
    const r = PutPhaseItemsSchema.safeParse({ items: [expense('A', 60, ['c1']), saving('B', 30)] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Total persen fase harus 100% (saat ini 90%)');
  });

  it('menolak kategori dobel, nama dobel, EXPENSE tanpa kategori, SAVING tanpa goal', () => {
    expect(PutPhaseItemsSchema.safeParse({ items: [expense('A', 50, ['c1']), expense('B', 50, ['c1'])] }).success).toBe(false);
    expect(PutPhaseItemsSchema.safeParse({ items: [expense('A', 50, ['c1']), expense('a', 50, ['c2'])] }).success).toBe(false);
    expect(PutPhaseItemsSchema.safeParse({ items: [expense('A', 100, [])] }).success).toBe(false);
    expect(PutPhaseItemsSchema.safeParse({ items: [{ name: 'S', kind: 'SAVING', percent: 100 }] }).success).toBe(false);
  });
});
