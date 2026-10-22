import { describe, it, expect } from 'vitest';
import { CreateTransactionSchema, TransactionListQuerySchema } from './transaction';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';

describe('CreateTransactionSchema', () => {
  const base = { type: 'EXPENSE', walletId: W1, categoryId: 'cat-expense-makan' };

  it('menerima amount number, "35rb", "1,2jt", "1.250.000" → bigint', () => {
    const parse = (amount: unknown) => CreateTransactionSchema.parse({ ...base, amount }).amount;
    expect(parse(35000)).toBe(35000n);
    expect(parse('35rb')).toBe(35000n);
    expect(parse('1,2jt')).toBe(1_200_000n);
    expect(parse('1.250.000')).toBe(1_250_000n);
  });

  it('menolak amount 0, negatif, desimal, dan tak terbaca', () => {
    for (const amount of [0, '0', -5, '-5rb', 10.5, 'abc', '']) {
      expect(CreateTransactionSchema.safeParse({ ...base, amount }).success).toBe(false);
    }
  });

  it('EXPENSE/INCOME wajib kategori dan tidak boleh toWalletId', () => {
    expect(CreateTransactionSchema.safeParse({ type: 'EXPENSE', walletId: W1, amount: 1000 }).success).toBe(false);
    expect(CreateTransactionSchema.safeParse({ ...base, amount: 1000, toWalletId: W2 }).success).toBe(false);
  });

  it('TRANSFER: wallet berbeda, tanpa kategori', () => {
    const ok = CreateTransactionSchema.safeParse({ type: 'TRANSFER', walletId: W1, toWalletId: W2, amount: 1000 });
    expect(ok.success).toBe(true);

    const same = CreateTransactionSchema.safeParse({ type: 'TRANSFER', walletId: W1, toWalletId: W1, amount: 1000 });
    expect(same.success).toBe(false);
    if (!same.success) expect(same.error.issues[0].message).toBe('Wallet asal dan tujuan tidak boleh sama');

    expect(CreateTransactionSchema.safeParse({ type: 'TRANSFER', walletId: W1, amount: 1000 }).success).toBe(false);
    expect(
      CreateTransactionSchema.safeParse({ type: 'TRANSFER', walletId: W1, toWalletId: W2, categoryId: 'x', amount: 1000 }).success,
    ).toBe(false);
  });

  it('menolak tanggal tidak valid', () => {
    expect(CreateTransactionSchema.safeParse({ ...base, amount: 1000, date: '2026-02-30' }).success).toBe(false);
    expect(CreateTransactionSchema.safeParse({ ...base, amount: 1000, date: '2026-02-28' }).success).toBe(true);
  });
});

describe('TransactionListQuerySchema', () => {
  it('limit default 20, max 100', () => {
    expect(TransactionListQuerySchema.parse({}).limit).toBe(20);
    expect(TransactionListQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(TransactionListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(TransactionListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('dateFrom tidak boleh setelah dateTo', () => {
    expect(TransactionListQuerySchema.safeParse({ dateFrom: '2026-10-10', dateTo: '2026-10-01' }).success).toBe(false);
  });
});
