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
 * Parse YYYY-MM format to period string
 */
export function getPeriod(date: Date = new Date()): string {
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
