import { describe, it, expect } from 'vitest';
import { formatCompact, formatMoney } from './money';

describe('formatMoney', () => {
  it('memformat dengan titik ribuan dan tanda negatif', () => {
    expect(formatMoney('0')).toBe('Rp0');
    expect(formatMoney('1250000')).toBe('Rp1.250.000');
    expect(formatMoney('-300')).toBe('-Rp300');
    expect(formatMoney(9007199254740993n)).toBe('Rp9.007.199.254.740.993');
  });
});

describe('formatCompact', () => {
  it('menyingkat ribu/juta/miliar', () => {
    expect(formatCompact('500')).toBe('500');
    expect(formatCompact('350000')).toBe('350rb');
    expect(formatCompact('1500000')).toBe('1,5jt');
    expect(formatCompact('-4000000')).toBe('-4jt');
    expect(formatCompact('2000000000')).toBe('2M');
  });
});
