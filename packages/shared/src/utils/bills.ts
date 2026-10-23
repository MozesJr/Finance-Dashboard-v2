/** Utilitas tagihan berkala: tanggal jatuh tempo berikutnya dan cadangan (virtual). Murni, tanpa float untuk uang. */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Jumlah hari dalam bulan (month 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Tanggal jatuh tempo yang ada di bulan (year, month), menjepit hari ke akhir bulan: dueDay 31 di Februari → 28/29. */
export function dueDateIn(year: number, month: number, dueDay: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(dueDay, daysInMonth(year, month)))}`;
}

/**
 * Jatuh tempo berikutnya setelah `current` (YYYY-MM-DD) bila dimajukan `intervalMonths` bulan.
 * `dueDay` = hari asli (1–31) agar 31 Jan → 28 Feb → 31 Mar tidak bergeser.
 */
export function nextDueDate(current: string, intervalMonths: number, dueDay: number): string {
  const [y, m] = current.split('-').map(Number);
  const index = y * 12 + (m - 1) + intervalMonths;
  return dueDateIn(Math.floor(index / 12), (index % 12) + 1, dueDay);
}

/** Selisih hari kalender (b − a) untuk tanggal YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Nominal yang perlu disisihkan per periode (dibulatkan ke atas agar total tidak kurang). */
export function reservePerPeriod(amount: bigint, intervalMonths: number): bigint {
  const n = BigInt(intervalMonths);
  return (amount + n - 1n) / n;
}

/**
 * Cadangan yang seharusnya sudah terkumpul: amount × min(periode berlalu, interval) / interval.
 * Setelah `interval` periode hasilnya persis `amount` (tanpa selisih pembulatan).
 */
export function accumulatedReserve(amount: bigint, intervalMonths: number, elapsedPeriods: number): bigint {
  const elapsed = Math.max(0, Math.min(elapsedPeriods, intervalMonths));
  return (amount * BigInt(elapsed)) / BigInt(intervalMonths);
}

/** Indeks bulan untuk selisih periode: kunci YYYY-MM → y*12+m. */
export function periodIndex(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + m;
}
