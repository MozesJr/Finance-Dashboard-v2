export interface SplitInput {
  percent: number;
  sortOrder: number;
}

/**
 * Bagi total (rupiah, BigInt) menurut persen. Sisa pembulatan diberikan ke item
 * dengan persen terbesar (seri → sortOrder terkecil) sehingga jumlahnya persis total.
 * Mengembalikan array sejajar dengan input.
 */
export function splitByPercent(total: bigint, items: SplitInput[]): bigint[] {
  const amounts = items.map((i) => (total * BigInt(i.percent)) / 100n);
  const allocated = amounts.reduce((acc, a) => acc + a, 0n);
  const percentSum = items.reduce((acc, i) => acc + i.percent, 0);
  if (items.length === 0 || percentSum !== 100) return amounts; // total ≠ 100% tidak dibagi paksa
  let largest = 0;
  items.forEach((item, index) => {
    const best = items[largest];
    if (item.percent > best.percent || (item.percent === best.percent && item.sortOrder < best.sortOrder)) {
      largest = index;
    }
  });
  amounts[largest] += total - allocated;
  return amounts;
}
