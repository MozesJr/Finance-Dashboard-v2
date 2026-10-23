import { z } from 'zod';
import { MAX_PERIOD_START_DAY, MIN_PERIOD_START_DAY } from '../utils/period';

export const PeriodStartDaySchema = z
  .number({ invalid_type_error: 'Tanggal mulai periode harus angka' })
  .int('Tanggal mulai periode harus bilangan bulat')
  .min(MIN_PERIOD_START_DAY, `Minimal tanggal ${MIN_PERIOD_START_DAY}`)
  .max(MAX_PERIOD_START_DAY, `Maksimal tanggal ${MAX_PERIOD_START_DAY} (agar ada di setiap bulan)`);

export const UpdateSettingsSchema = z.object({ periodStartDay: PeriodStartDaySchema });
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

/** Info periode dalam respons API (tanggal kalender YYYY-MM-DD). */
export const PeriodInfoSchema = z.object({
  key: z.string(),
  label: z.string(),
  start: z.string(),
  end: z.string(),
});
export type PeriodInfo = z.infer<typeof PeriodInfoSchema>;

export const SettingsSchema = z.object({
  periodStartDay: z.number().int(),
  currentPeriod: PeriodInfoSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;
