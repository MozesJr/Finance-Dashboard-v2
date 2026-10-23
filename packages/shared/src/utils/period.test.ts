import { describe, expect, it } from 'vitest';
import { getCurrentPeriod, getPeriod, getPeriodKey, getPeriodRange, periodLabel } from './period';
import { getMonthRange } from './date';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('getPeriod: startDay 1 = bulan kalender persis', () => {
  it('kunci, rentang dan label sama dengan bulan kalender', () => {
    const p = getPeriod('2026-10-15', 1);
    expect(p.key).toBe('2026-10');
    expect(iso(p.start)).toBe('2026-10-01');
    expect(iso(p.end)).toBe('2026-10-31');
    expect(iso(p.endExclusive)).toBe('2026-11-01');
    expect(p.label).toBe('Okt 2026');
    expect(getPeriodRange('2026-10', 1)).toEqual(getMonthRange('2026-10'));
  });
});

describe('getPeriod: startDay 25 (dinamai bulan tempat periode berakhir)', () => {
  it('25 Okt – 24 Nov = 2026-11', () => {
    for (const d of ['2026-10-25', '2026-10-31', '2026-11-01', '2026-11-24']) expect(getPeriodKey(d, 25)).toBe('2026-11');
    const p = getPeriod('2026-11-10', 25);
    expect(iso(p.start)).toBe('2026-10-25');
    expect(iso(p.end)).toBe('2026-11-24');
    expect(iso(p.endExclusive)).toBe('2026-11-25');
    expect(p.label).toBe('Nov 2026 (25 Okt – 24 Nov)');
  });

  it('hari pergantian: 24 Nov masih 2026-11, 25 Nov mulai 2026-12', () => {
    expect(getPeriodKey('2026-11-24', 25)).toBe('2026-11');
    expect(getPeriodKey('2026-11-25', 25)).toBe('2026-12');
  });

  it('akhir tahun: 25 Des 2026 – 24 Jan 2027 = 2027-01; label lintas tahun', () => {
    expect(getPeriodKey('2026-12-24', 25)).toBe('2026-12');
    expect(getPeriodKey('2026-12-25', 25)).toBe('2027-01');
    expect(getPeriodKey('2027-01-24', 25)).toBe('2027-01');
    const p = getPeriod('2026-12-31', 25);
    expect(p.label).toBe('Jan 2027 (25 Des – 24 Jan)');
    expect(iso(p.start)).toBe('2026-12-25');
    expect(iso(p.endExclusive)).toBe('2027-01-25');
  });

  it('periode yang melewati Februari (tahun biasa dan kabisat)', () => {
    // 25 Jan – 24 Feb 2026 = "2026-02"; 25 Feb – 24 Mar = "2026-03"
    expect(getPeriodKey('2026-02-24', 25)).toBe('2026-02');
    expect(getPeriodKey('2026-02-25', 25)).toBe('2026-03');
    expect(getPeriodKey('2026-02-28', 25)).toBe('2026-03');
    expect(getPeriodKey('2028-02-29', 25)).toBe('2028-03'); // kabisat
    expect(iso(getPeriod('2028-03-01', 25).start)).toBe('2028-02-25');
  });
});

describe('getPeriod: startDay 28 dan Februari', () => {
  it('28 Jan – 27 Feb = 2026-02; 28 Feb 2026 (hari terakhir) = 2026-03', () => {
    expect(getPeriodKey('2026-01-27', 28)).toBe('2026-01');
    expect(getPeriodKey('2026-01-28', 28)).toBe('2026-02');
    expect(getPeriodKey('2026-02-27', 28)).toBe('2026-02');
    expect(getPeriodKey('2026-02-28', 28)).toBe('2026-03');
    const p = getPeriod('2026-03-05', 28);
    expect(iso(p.start)).toBe('2026-02-28');
    expect(iso(p.end)).toBe('2026-03-27');
  });

  it('setiap tanggal di Februari 2026 masuk tepat satu periode dan rentang berurutan tanpa celah', () => {
    let prevEnd: string | null = null;
    for (let d = 1; d <= 28; d++) {
      const date = `2026-02-${String(d).padStart(2, '0')}`;
      const p = getPeriod(date, 28);
      expect(date >= iso(p.start) && date < iso(p.endExclusive)).toBe(true);
      if (prevEnd && p.key === getPeriodKey(`2026-02-${String(d - 1).padStart(2, '0')}`, 28)) expect(iso(p.endExclusive)).toBe(prevEnd);
      prevEnd = iso(p.endExclusive);
    }
  });
});

describe('Asia/Jakarta: pukul 00:00 WIB di hari pergantian', () => {
  it('24 Okt 2026 16:59:59Z = 24 Okt 23:59:59 WIB → periode 2026-10; 17:00:00Z = 25 Okt 00:00 WIB → 2026-11', () => {
    expect(getPeriodKey(new Date('2026-10-24T16:59:59Z'), 25)).toBe('2026-10');
    expect(getPeriodKey(new Date('2026-10-24T17:00:00Z'), 25)).toBe('2026-11');
  });

  it('1 Okt 00:00 WIB (30 Sep 17:00Z) pada startDay 1 → 2026-10; semenit sebelumnya → 2026-09', () => {
    expect(getPeriodKey(new Date('2026-09-30T17:00:00Z'), 1)).toBe('2026-10');
    expect(getPeriodKey(new Date('2026-09-30T16:59:00Z'), 1)).toBe('2026-09');
  });

  it('getCurrentPeriod memakai tanggal WIB', () => {
    expect(getCurrentPeriod(25, new Date('2026-11-24T17:00:00Z')).key).toBe('2026-12');
  });
});

describe('periodLabel dan validasi', () => {
  it('label', () => {
    expect(periodLabel('2026-11', 25)).toBe('Nov 2026 (25 Okt – 24 Nov)');
    expect(periodLabel('2026-02', 28)).toBe('Feb 2026 (28 Jan – 27 Feb)');
    expect(periodLabel('2026-11', 1)).toBe('Nov 2026');
  });

  it('startDay di luar 1–28 ditolak', () => {
    expect(() => getPeriodKey('2026-10-10', 0)).toThrow(RangeError);
    expect(() => getPeriodKey('2026-10-10', 29)).toThrow(RangeError);
    expect(() => getPeriodKey('2026-10-10', 2.5)).toThrow(RangeError);
  });

  it('rentang periode berurutan: akhir periode k = awal periode k+1 (startDay 25)', () => {
    for (const key of ['2026-01', '2026-06', '2026-12']) {
      const next = getPeriodRange(key === '2026-12' ? '2027-01' : `2026-${String(Number(key.slice(5)) + 1).padStart(2, '0')}`, 25);
      expect(iso(getPeriodRange(key, 25).endExclusive)).toBe(iso(next.start));
    }
  });
});
