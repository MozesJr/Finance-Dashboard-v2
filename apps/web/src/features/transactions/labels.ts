import type { TxType } from 'shared';

/** ADJUSTMENT dibuat sistem dari "Perbarui nilai" dompet investasi; bukan pemasukan/pengeluaran. */
export type AnyTxType = TxType | 'ADJUSTMENT';

export const TX_TYPE_LABELS: Record<AnyTxType, string> = {
  EXPENSE: 'Pengeluaran',
  INCOME: 'Pemasukan',
  TRANSFER: 'Transfer',
  ADJUSTMENT: 'Penyesuaian nilai',
};

export const TX_TYPE_CLASS: Record<AnyTxType, string> = {
  EXPENSE: 'text-expense',
  INCOME: 'text-income',
  TRANSFER: 'text-fg',
  ADJUSTMENT: 'text-fg',
};

export const TX_TYPE_SIGN: Record<AnyTxType, string> = { EXPENSE: '-', INCOME: '+', TRANSFER: '', ADJUSTMENT: '' };
