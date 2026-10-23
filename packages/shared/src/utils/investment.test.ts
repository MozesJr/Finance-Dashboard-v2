import { describe, expect, it } from 'vitest';
import { investmentMetrics } from './investment';

describe('investmentMetrics', () => {
  it('rugi: nilai di bawah modal', () => {
    expect(investmentMetrics(8_700_000n, 10_000_000n)).toEqual({ unrealized: -1_300_000n, unrealizedPct: -13 });
  });

  it('untung dengan desimal dibulatkan 2 digit', () => {
    expect(investmentMetrics(10_333_333n, 10_000_000n)).toEqual({ unrealized: 333_333n, unrealizedPct: 3.33 });
  });

  it('impas', () => {
    expect(investmentMetrics(5_000_000n, 5_000_000n)).toEqual({ unrealized: 0n, unrealizedPct: 0 });
  });

  it('modal 0 atau negatif: persen null, rupiah tetap dihitung', () => {
    expect(investmentMetrics(1_000_000n, 0n)).toEqual({ unrealized: 1_000_000n, unrealizedPct: null });
    expect(investmentMetrics(0n, -500n)).toEqual({ unrealized: 500n, unrealizedPct: null });
  });

  it('pembulatan setengah menjauhi nol untuk rugi dan untung', () => {
    expect(investmentMetrics(9_999_500n, 10_000_000n).unrealizedPct).toBe(-0.01);
    expect(investmentMetrics(10_000_500n, 10_000_000n).unrealizedPct).toBe(0.01);
  });
});
