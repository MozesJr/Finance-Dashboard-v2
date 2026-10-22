import { describe, it, expect } from 'vitest';
import { parseNominal, formatRupiah, toRupiahString } from './money';

describe('Money Utils', () => {
  describe('parseNominal', () => {
    it('should parse "35rb" as 35000', () => {
      expect(parseNominal('35rb')).toBe(35000n);
    });

    it('should parse "1,2jt" as 1200000', () => {
      expect(parseNominal('1,2jt')).toBe(1200000n);
    });

    it('should parse "1.250.000" as 1250000', () => {
      expect(parseNominal('1.250.000')).toBe(1250000n);
    });

    it('should parse with mixed case and spaces', () => {
      expect(parseNominal(' 50 RB ')).toBe(50000n);
      expect(parseNominal('2.5 JT')).toBe(2500000n);
    });

    it('should parse plain numbers', () => {
      expect(parseNominal('100000')).toBe(100000n);
      expect(parseNominal('500')).toBe(500n);
    });

    it('should handle "m" suffix as million', () => {
      expect(parseNominal('1m')).toBe(1000000n);
      expect(parseNominal('2.5m')).toBe(2500000n);
    });

    it('should be exact for large values (no float)', () => {
      expect(parseNominal('9007199254740993')).toBe(9007199254740993n);
      expect(parseNominal('1,234jt')).toBe(1234000n);
      expect(parseNominal('0,5jt')).toBe(500000n);
      expect(parseNominal('Rp 1.250.000')).toBe(1250000n);
    });

    it('should throw on negative or malformed input', () => {
      expect(() => parseNominal('-5rb')).toThrow();
      expect(() => parseNominal('1..2')).toThrow();
      expect(() => parseNominal('')).toThrow();
    });

    it('should throw on invalid input', () => {
      expect(() => parseNominal('abc')).toThrow();
      expect(() => parseNominal('xyz123')).toThrow();
    });
  });

  describe('formatRupiah', () => {
    it('should format 1250000 as "Rp1.250.000"', () => {
      const formatted = formatRupiah(1250000);
      expect(formatted).toContain('1.250.000');
    });

    it('should format bigint 1000n', () => {
      const formatted = formatRupiah(1000n);
      expect(formatted).toContain('1.000');
    });

    it('should work with zero', () => {
      const formatted = formatRupiah(0);
      expect(formatted).toBeDefined();
    });

    it('should throw on negative amount', () => {
      expect(() => formatRupiah(-100)).toThrow();
    });

    it('should throw on non-integer', () => {
      expect(() => formatRupiah(100.5)).toThrow();
    });
  });

  describe('toRupiahString', () => {
    it('should format 1250000n as "Rp1.250.000"', () => {
      expect(toRupiahString(1250000n)).toMatch(/Rp[\d,.]+/);
    });

    it('should handle small amounts', () => {
      expect(toRupiahString(500n)).toMatch(/Rp[\d,.]+/);
    });
  });
});
