/**
 * Parse Indonesian nominal formats to Rupiah (BigInt)
 * In Indonesian format: comma (,) is decimal separator, dot (.) is thousands separator
 * Examples: "35rb" → 35000n, "1,2jt" → 1200000n, "1.250.000" → 1250000n, "2.5jt" → 2500000n
 */
export function parseNominal(input: string): bigint {
  let normalized = input.toLowerCase().trim();

  // Remove spaces
  normalized = normalized.replace(/\s+/g, '');

  // Helper to normalize number string
  const normalizeNumber = (numStr: string): string => {
    // Find last dot and comma
    const lastDot = numStr.lastIndexOf('.');
    const lastComma = numStr.lastIndexOf(',');

    // If there's a decimal separator (last dot or comma with 1-2 digits after)
    if (lastComma > lastDot && lastComma !== -1) {
      // Comma is decimal separator
      // Remove all dots (thousands separators)
      return numStr.replace(/\./g, '').replace(',', '.');
    } else if (lastDot !== -1) {
      const afterDot = numStr.substring(lastDot + 1);
      if (afterDot.length <= 2 && /^\d+$/.test(afterDot)) {
        // Dot with 1-2 digits = decimal separator
        return numStr.replace(/,/g, '').replace(/\./g, '.');
      } else if (afterDot.length === 3) {
        // Dot with 3 digits = thousands separator
        return numStr.replace(/[.,]/g, '');
      }
    }

    // No clear decimal separator, remove all separators
    return numStr.replace(/[.,]/g, '');
  };

  // Handle Indonesian shorthand
  if (normalized.includes('rb')) {
    let numStr = normalized.replace('rb', '');
    numStr = normalizeNumber(numStr);
    const num = parseFloat(numStr);
    return BigInt(Math.round(num * 1000));
  }

  if (normalized.includes('jt')) {
    let numStr = normalized.replace('jt', '');
    numStr = normalizeNumber(numStr);
    const num = parseFloat(numStr);
    return BigInt(Math.round(num * 1000000));
  }

  if (normalized.includes('m')) {
    let numStr = normalized.replace('m', '');
    numStr = normalizeNumber(numStr);
    const num = parseFloat(numStr);
    return BigInt(Math.round(num * 1000000));
  }

  // Try direct parsing
  const numStr = normalizeNumber(normalized);
  const num = parseFloat(numStr);
  if (isNaN(num)) {
    throw new Error(`Cannot parse nominal: ${input}`);
  }

  return BigInt(Math.round(num));
}

/**
 * Format BigInt Rupiah to Indonesian currency string
 * Example: 1250000n → "Rp1.250.000"
 */
export function formatRupiah(amount: bigint | number): string {
  const num = typeof amount === 'bigint' ? Number(amount) : amount;

  if (!Number.isInteger(num) || num < 0) {
    throw new Error('Amount must be non-negative integer');
  }

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Get rupiah symbol with amount
 */
export function toRupiahString(amount: bigint): string {
  return `Rp${Number(amount).toLocaleString('id-ID')}`;
}
