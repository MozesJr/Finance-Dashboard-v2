const SUFFIX_MULTIPLIERS: Array<[string, bigint]> = [
  ['juta', 1_000_000n],
  ['jt', 1_000_000n],
  ['ribu', 1_000n],
  ['rb', 1_000n],
  ['k', 1_000n],
  ['m', 1_000_000n],
];

/**
 * Normalize an Indonesian-style number ("1.250.000", "1,2", "2.5") to a plain
 * decimal string using "." as the only separator. Returns null if malformed.
 */
function normalizeNumber(numStr: string, hasSuffix: boolean): string | null {
  const lastDot = numStr.lastIndexOf('.');
  const lastComma = numStr.lastIndexOf(',');
  let out: string;

  if (lastComma > lastDot) {
    const afterComma = numStr.length - lastComma - 1;
    const commaCount = numStr.split(',').length - 1;
    if (!hasSuffix && afterComma === 3 && commaCount >= 1 && lastDot === -1) {
      out = numStr.replace(/,/g, ''); // "1,250" tanpa suffix = ribuan
    } else {
      out = numStr.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastDot !== -1) {
    const afterDot = numStr.length - lastDot - 1;
    if (afterDot === 3) {
      out = numStr.replace(/[.,]/g, ''); // pemisah ribuan
    } else {
      out = numStr.replace(/,/g, ''); // 1-2 digit (atau lainnya) = desimal
    }
  } else {
    out = numStr;
  }

  return /^\d+(\.\d+)?$/.test(out) ? out : null;
}

/**
 * Parse Indonesian nominal formats to Rupiah (BigInt) tanpa float.
 * Examples: "35rb" → 35000n, "1,2jt" → 1200000n, "1.250.000" → 1250000n, "2.5jt" → 2500000n
 */
export function parseNominal(input: string): bigint {
  let normalized = input.toLowerCase().replace(/\s+/g, '');
  if (normalized.startsWith('rp')) normalized = normalized.slice(2);

  let multiplier = 1n;
  let hasSuffix = false;
  for (const [suffix, mult] of SUFFIX_MULTIPLIERS) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      multiplier = mult;
      hasSuffix = true;
      break;
    }
  }

  const decimal = normalizeNumber(normalized, hasSuffix);
  if (decimal === null) {
    throw new Error(`Cannot parse nominal: ${input}`);
  }

  const [intPart, fracPart = ''] = decimal.split('.');
  const scale = multiplier.toString().length - 1; // jumlah nol
  const padded = fracPart.padEnd(scale + 1, '0');
  const kept = padded.slice(0, scale);
  const roundUp = padded.charCodeAt(scale) >= 53; // digit berikutnya >= 5
  const value = BigInt(intPart) * multiplier + BigInt(kept || '0');
  return roundUp ? value + 1n : value;
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
