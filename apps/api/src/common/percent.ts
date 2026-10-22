/** Persentase dengan 1 desimal (dibulatkan menjauhi nol) dihitung dari bigint, tanpa float untuk nominal. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  const negative = part < 0n !== whole < 0n;
  const absPart = part < 0n ? -part : part;
  const absWhole = whole < 0n ? -whole : whole;
  const tenths = (absPart * 2000n + absWhole) / (2n * absWhole);
  return (negative ? -Number(tenths) : Number(tenths)) / 10;
}

export function percentChange(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;
  const base = previous < 0n ? -previous : previous;
  return percentOf(current - previous, base);
}
