import { describe, expect, it } from 'vitest';
import { accumulatedReserve, daysBetween, daysInMonth, dueDateIn, nextDueDate, periodIndex, reservePerPeriod } from './bills';

describe('nextDueDate (maju N bulan, menjepit akhir bulan)', () => {
  it('bulanan dan per 3 bulan biasa', () => {
    expect(nextDueDate('2026-11-25', 1, 25)).toBe('2026-12-25');
    expect(nextDueDate('2026-11-25', 3, 25)).toBe('2027-02-25');
    expect(nextDueDate('2026-12-25', 12, 25)).toBe('2027-12-25');
  });

  it('akhir tahun dan lintas tahun', () => {
    expect(nextDueDate('2026-10-15', 3, 15)).toBe('2027-01-15');
    expect(nextDueDate('2026-12-31', 1, 31)).toBe('2027-01-31');
  });

  it('tanggal 31: 31 Jan → 28 Feb (tahun biasa) → 31 Mar tidak bergeser', () => {
    expect(nextDueDate('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(nextDueDate('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(nextDueDate('2026-03-31', 1, 31)).toBe('2026-04-30');
  });

  it('tahun kabisat: 31 Jan 2028 → 29 Feb 2028; per 3 bulan 30 Nov → 28 Feb', () => {
    expect(nextDueDate('2028-01-31', 1, 31)).toBe('2028-02-29');
    expect(nextDueDate('2026-11-30', 3, 30)).toBe('2027-02-28');
    expect(nextDueDate('2027-11-30', 3, 30)).toBe('2028-02-29');
  });

  it('dueDay asli dipertahankan walau tanggal saat ini sudah terjepit', () => {
    expect(nextDueDate('2026-02-28', 3, 30)).toBe('2026-05-30');
  });
});

describe('tanggal dan hari', () => {
  it('daysInMonth dan dueDateIn', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(dueDateIn(2026, 4, 31)).toBe('2026-04-30');
  });

  it('daysBetween lintas bulan dan tahun', () => {
    expect(daysBetween('2026-10-23', '2026-10-30')).toBe(7);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-10-23', '2026-10-22')).toBe(-1);
  });
});

describe('cadangan', () => {
  it('per periode dibulatkan ke atas', () => {
    expect(reservePerPeriod(3_000_000n, 3)).toBe(1_000_000n);
    expect(reservePerPeriod(1_000_000n, 3)).toBe(333_334n);
    expect(reservePerPeriod(1_200_000n, 1)).toBe(1_200_000n);
  });

  it('terkumpul = amount × min(berlalu, interval) / interval; tepat amount setelah interval; tidak negatif', () => {
    expect(accumulatedReserve(3_000_000n, 3, 0)).toBe(0n);
    expect(accumulatedReserve(3_000_000n, 3, 1)).toBe(1_000_000n);
    expect(accumulatedReserve(3_000_000n, 3, 2)).toBe(2_000_000n);
    expect(accumulatedReserve(1_000_000n, 3, 3)).toBe(1_000_000n);
    expect(accumulatedReserve(1_000_000n, 3, 9)).toBe(1_000_000n);
    expect(accumulatedReserve(1_000_000n, 3, -2)).toBe(0n);
  });

  it('periodIndex mengurutkan kunci periode lintas tahun', () => {
    expect(periodIndex('2027-01') - periodIndex('2026-12')).toBe(1);
  });
});
