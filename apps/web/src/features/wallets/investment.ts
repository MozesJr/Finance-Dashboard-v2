import { investmentMetrics } from 'shared';
import type { WalletDto } from './api';

export interface InvestmentTotals {
  value: string;
  capital: string;
  unrealized: string;
  unrealizedPct: number | null;
  count: number;
}

/** Ringkasan semua dompet INVESTMENT aktif; null bila tidak ada. */
export function investmentTotals(wallets: WalletDto[]): InvestmentTotals | null {
  const inv = wallets.filter((w) => w.type === 'INVESTMENT' && w.investment && !w.isArchived);
  if (inv.length === 0) return null;
  const value = inv.reduce((a, w) => a + BigInt(w.balance), 0n);
  const capital = inv.reduce((a, w) => a + BigInt(w.investment?.capital ?? '0'), 0n);
  const m = investmentMetrics(value, capital);
  return { value: value.toString(), capital: capital.toString(), unrealized: m.unrealized.toString(), unrealizedPct: m.unrealizedPct, count: inv.length };
}
