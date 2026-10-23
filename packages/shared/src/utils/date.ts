/**
 * Timezone utility for Asia/Jakarta
 * All transaction dates are treated as Asia/Jakarta timezone
 */

const TIMEZONE = 'Asia/Jakarta';

/**
 * Get current date in Asia/Jakarta timezone (as Date object at midnight)
 */
export function getTodayInJakarta(): Date {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const [year, month, day] = formatter.format(new Date()).split('-');
  return new Date(`${year}-${month}-${day}T00:00:00Z`);
}

/**
 * Convert Date to YYYY-MM-DD string (date-only, no time)
 */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Bulan kalender (YYYY-MM) dari sebuah instan waktu di Asia/Jakarta.
 * Untuk periode keuangan yang mengikuti gajian lihat getPeriod() di period.ts.
 */
export function getCalendarMonth(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  });

  const [year, month] = formatter.format(date).split('-');
  return `${year}-${month}`;
}

/**
 * Get start of month (Jakarta timezone)
 */
export function getMonthStart(date: Date = new Date()): Date {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  });

  const [year, month] = formatter.format(date).split('-');
  return new Date(`${year}-${month}-01T00:00:00Z`);
}

/**
 * Get end of month (Jakarta timezone)
 */
export function getMonthEnd(date: Date = new Date()): Date {
  const nextMonth = new Date(date);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  });

  const [year, month] = formatter.format(nextMonth).split('-');
  const lastDay = new Date(`${year}-${month}-01T00:00:00Z`);
  lastDay.setDate(0);

  return lastDay;
}

/** Bulan berjalan di Asia/Jakarta, format YYYY-MM */
export function getCurrentMonthJakarta(now: Date = new Date()): string {
  return getCalendarMonth(now);
}

/** Geser bulan YYYY-MM sebanyak delta bulan (boleh negatif). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12 + 12) % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

/**
 * Rentang tanggal kalender sebuah bulan: start inklusif, endExclusive = tanggal 1 bulan berikutnya.
 * Kolom transaksi bertipe DATE (sudah tanggal Asia/Jakarta), jadi batas bulan cukup tanggal kalender.
 */
export function getMonthRange(month: string): { start: Date; endExclusive: Date } {
  return {
    start: new Date(`${month}-01T00:00:00Z`),
    endExclusive: new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`),
  };
}
