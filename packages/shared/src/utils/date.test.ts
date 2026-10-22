import { describe, it, expect } from 'vitest';
import { getCurrentMonthJakarta, getMonthRange, shiftMonth } from './date';

describe('date utils', () => {
  it('shiftMonth melewati batas tahun', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', -5)).toBe('2026-05');
    expect(shiftMonth('2026-03', -15)).toBe('2024-12');
  });

  it('getMonthRange: start inklusif, end = tanggal 1 bulan berikutnya', () => {
    const r = getMonthRange('2026-12');
    expect(r.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.endExclusive.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(getMonthRange('2026-02').endExclusive.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('bulan berjalan mengikuti Asia/Jakarta (UTC+7)', () => {
    // 30 Sep 2026 20:00 UTC = 1 Okt 2026 03:00 WIB
    expect(getCurrentMonthJakarta(new Date('2026-09-30T20:00:00Z'))).toBe('2026-10');
    expect(getCurrentMonthJakarta(new Date('2026-09-30T16:59:00Z'))).toBe('2026-09');
  });
});
