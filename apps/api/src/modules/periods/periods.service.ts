import { Injectable, NotFoundException } from '@nestjs/common';
import { getCurrentPeriod, getPeriod, getPeriodKey, getPeriodRange, periodLabel, shiftMonth, toDateString } from 'shared';
import type { Period, PeriodInfo } from 'shared';
import { PeriodsRepository } from './periods.repository';

export const toPeriodInfo = (p: Period): PeriodInfo => ({ key: p.key, label: p.label, start: toDateString(p.start), end: toDateString(p.end) });

/** Periode keuangan per user (tanggal mulai dari pengaturan; default 1 = bulan kalender). */
@Injectable()
export class PeriodsService {
  constructor(private repository: PeriodsRepository) {}

  async startDay(userId: string): Promise<number> {
    const day = await this.repository.getStartDay(userId);
    if (day === null) throw new NotFoundException('User tidak ditemukan');
    return day;
  }

  async current(userId: string, now: Date = new Date()): Promise<Period> {
    return getCurrentPeriod(await this.startDay(userId), now);
  }

  /** Periode untuk kunci YYYY-MM (default: periode berjalan). */
  async resolve(userId: string, key?: string, now: Date = new Date()): Promise<Period & { startDay: number }> {
    const startDay = await this.startDay(userId);
    if (!key) return { ...getCurrentPeriod(startDay, now), startDay };
    const { start, endExclusive } = getPeriodRange(key, startDay);
    return { key, label: periodLabel(key, startDay), start, end: new Date(endExclusive.getTime() - 86_400_000), endExclusive, startDay };
  }

  /** Periode yang memuat tanggal kalender tertentu. */
  async forDate(userId: string, date: Date | string): Promise<Period> {
    return getPeriod(date, await this.startDay(userId));
  }

  keyForDate(date: Date | string, startDay: number): string {
    return getPeriodKey(date, startDay);
  }

  shift(key: string, delta: number): string {
    return shiftMonth(key, delta);
  }

  async settings(userId: string, now: Date = new Date()) {
    const startDay = await this.startDay(userId);
    return { periodStartDay: startDay, currentPeriod: toPeriodInfo(getCurrentPeriod(startDay, now)) };
  }

  async updateStartDay(userId: string, startDay: number) {
    await this.startDay(userId);
    await this.repository.setStartDay(userId, startDay);
    return this.settings(userId);
  }
}
