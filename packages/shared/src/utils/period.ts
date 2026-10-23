import { shiftMonth } from './date';

const TIMEZONE = 'Asia/Jakarta';
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const MIN_PERIOD_START_DAY = 1;
export const MAX_PERIOD_START_DAY = 28;

/**
 * Periode keuangan: rentang yang dimulai tanggal `startDay` dan dinamai bulan tempat periode BERAKHIR.
 * startDay 25 → 25 Okt – 24 Nov = "2026-11". startDay 1 = bulan kalender persis.
 */
export interface Period {
  /** "YYYY-MM" (bulan tempat periode berakhir) */
  key: string;
  /** mis. "Nov 2026 (25 Okt – 24 Nov)"; startDay 1: "Okt 2026" */
  label: string;
  /** hari pertama (inklusif), tengah malam UTC pada tanggal kalender */
  start: Date;
  /** hari terakhir (inklusif) */
  end: Date;
  /** hari pertama periode berikutnya (eksklusif) */
  endExclusive: Date;
}

export function normalizeStartDay(startDay: number): number {
  if (!Number.isInteger(startDay) || startDay < MIN_PERIOD_START_DAY || startDay > MAX_PERIOD_START_DAY) {
    throw new RangeError(`startDay harus bilangan bulat ${MIN_PERIOD_START_DAY}–${MAX_PERIOD_START_DAY}`);
  }
  return startDay;
}

/** Komponen tanggal kalender: Date diartikan sebagai instan waktu di zona tz; string YYYY-MM-DD sudah tanggal kalender. */
function calendarParts(date: Date | string, tz: string): { year: number; month: number; day: number } {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!m) throw new RangeError(`Tanggal tidak valid: ${date}`);
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date)
    .split('-')
    .map(Number);
  return { year, month, day };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const utcDate = (key: string, day: number) => new Date(`${key}-${pad(day)}T00:00:00Z`);

/** Kunci periode (YYYY-MM) yang memuat tanggal tersebut. */
export function getPeriodKey(date: Date | string, startDay = 1, tz: string = TIMEZONE): string {
  normalizeStartDay(startDay);
  const { year, month, day } = calendarParts(date, tz);
  const ym = `${pad(year, 4)}-${pad(month)}`;
  return startDay > 1 && day >= startDay ? shiftMonth(ym, 1) : ym;
}

/** Rentang tanggal kalender sebuah periode: start inklusif, endExclusive = hari pertama periode berikutnya. */
export function getPeriodRange(key: string, startDay = 1): { start: Date; endExclusive: Date } {
  normalizeStartDay(startDay);
  if (startDay === 1) return { start: utcDate(key, 1), endExclusive: utcDate(shiftMonth(key, 1), 1) };
  return { start: utcDate(shiftMonth(key, -1), startDay), endExclusive: utcDate(key, startDay) };
}

/** "Nov 2026 (25 Okt – 24 Nov)"; startDay 1 → "Okt 2026". */
export function periodLabel(key: string, startDay = 1): string {
  const [y, m] = key.split('-').map(Number);
  const base = `${SHORT_MONTHS[m - 1]} ${y}`;
  if (startDay === 1) return base;
  const { start, endExclusive } = getPeriodRange(key, startDay);
  const end = new Date(endExclusive.getTime() - 86_400_000);
  const fmt = (d: Date) => `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
  return `${base} (${fmt(start)} – ${fmt(end)})`;
}

/** Periode keuangan yang memuat `date` (Date = instan waktu di tz; string = tanggal kalender). */
export function getPeriod(date: Date | string, startDay = 1, tz: string = TIMEZONE): Period {
  const key = getPeriodKey(date, startDay, tz);
  const { start, endExclusive } = getPeriodRange(key, startDay);
  return { key, label: periodLabel(key, startDay), start, end: new Date(endExclusive.getTime() - 86_400_000), endExclusive };
}

export function getCurrentPeriod(startDay = 1, now: Date = new Date(), tz: string = TIMEZONE): Period {
  return getPeriod(now, startDay, tz);
}
