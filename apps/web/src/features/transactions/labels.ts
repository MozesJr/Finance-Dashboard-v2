import type { TxType } from 'shared';

export const TX_TYPE_LABELS: Record<TxType, string> = {
  EXPENSE: 'Pengeluaran',
  INCOME: 'Pemasukan',
  TRANSFER: 'Transfer',
};

export const TX_TYPE_CLASS: Record<TxType, string> = {
  EXPENSE: 'text-expense',
  INCOME: 'text-income',
  TRANSFER: 'text-fg',
};

export const TX_TYPE_SIGN: Record<TxType, string> = { EXPENSE: '-', INCOME: '+', TRANSFER: '' };
