export interface InvestmentMetrics {
  /** nilai sekarang − modal (rupiah, bisa negatif) */
  unrealized: bigint;
  /** persen terhadap modal dengan 2 desimal (mis. -12.34); null bila modal ≤ 0 */
  unrealizedPct: number | null;
}

/** Untung/rugi belum direalisasi. Murni BigInt; persen dihitung dari basis poin agar tak ada float uang. */
export function investmentMetrics(currentValue: bigint, capital: bigint): InvestmentMetrics {
  const unrealized = currentValue - capital;
  if (capital <= 0n) return { unrealized, unrealizedPct: null };
  // Pembulatan setengah menjauhi nol pada 0,01%.
  const scaled = unrealized * 10_000n;
  const half = capital / 2n;
  const bp = scaled >= 0n ? (scaled + half) / capital : -((-scaled + half) / capital);
  return { unrealized, unrealizedPct: Number(bp) / 100 };
}
