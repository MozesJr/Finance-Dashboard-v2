import { z } from 'zod';
import { MonthStringSchema, UuidSchema } from './common';

/** Aksi checklist gajian: itemKey "s:<posId>" (setor), "e:<posId>" (catat pengeluaran), "t:<tagihanId>" (bayar tagihan), "inc" (perbarui gaji di alokasi). */
export const PaydayActionSchema = z.object({
  itemKey: z.string().min(1).max(60),
  periodKey: MonthStringSchema.optional(),
  /** Pos tabungan untuk goal TANPA dompet penyimpanan: dompet tujuan setoran. */
  destinationWalletId: UuidSchema.nullable().optional(),
});
export type PaydayActionInput = z.infer<typeof PaydayActionSchema>;

/** Kategori sistem "Gaji": pemicu checklist gajian. */
export const SALARY_CATEGORY_ID = 'cat-income-gaji';
