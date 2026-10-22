/** Format nominal rupiah (string/bigint, boleh negatif) tanpa float: "-Rp1.250.000". */
export function formatMoney(value: string | bigint): string {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  const negative = n < 0n;
  const digits = (negative ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}Rp${digits}`;
}

/** Untuk sumbu grafik: 1.5jt, 350rb. */
export function formatCompact(value: string | bigint): string {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  const abs = n < 0n ? -n : n;
  const sign = n < 0n ? '-' : '';
  const fmt = (v: bigint, unit: bigint, suffix: string) => {
    const tenths = (v * 10n) / unit;
    const text = tenths % 10n === 0n ? (tenths / 10n).toString() : `${tenths / 10n},${tenths % 10n}`;
    return `${sign}${text}${suffix}`;
  };
  if (abs >= 1_000_000_000n) return fmt(abs, 1_000_000_000n, 'M');
  if (abs >= 1_000_000n) return fmt(abs, 1_000_000n, 'jt');
  if (abs >= 1_000n) return fmt(abs, 1_000n, 'rb');
  return `${sign}${abs}`;
}
