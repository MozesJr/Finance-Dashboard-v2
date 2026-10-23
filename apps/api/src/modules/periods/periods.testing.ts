import { getCurrentPeriod, getPeriodKey, getPeriodRange, periodLabel } from 'shared';

/** PeriodsService palsu untuk spec: memakai util shared yang asli, startDay tetap. */
export function fakePeriods(startDay = 1, now?: Date) {
  const resolve = jest.fn(async (_userId: string, key?: string) => {
    if (!key) return { ...getCurrentPeriod(startDay, now), startDay };
    const { start, endExclusive } = getPeriodRange(key, startDay);
    return { key, label: periodLabel(key, startDay), start, end: new Date(endExclusive.getTime() - 86_400_000), endExclusive, startDay };
  });
  return {
    resolve,
    current: jest.fn(async () => getCurrentPeriod(startDay, now)),
    startDay: jest.fn(async () => startDay),
    keyForDate: (date: Date | string, sd: number) => getPeriodKey(date, sd),
  };
}
