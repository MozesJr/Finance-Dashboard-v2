import { parseTransactionLine, type ParseContext } from 'shared';
import type { AiTransactionResult } from '../../ai/ai-transaction.parser';
import { mergeAiGuess } from './free-text.merge';

const ctx: ParseContext = { today: '2026-10-23', wallets: [{ id: 'w-bca', name: 'BCA' }, { id: 'w-gopay', name: 'GoPay' }] };
const options = { today: '2026-10-23', defaultWalletId: 'w-bca' };
const ai = (over: Partial<AiTransactionResult> = {}): AiTransactionResult => ({
  type: 'EXPENSE',
  amount: 1_000_000n,
  categoryId: 'cat-expense-transport',
  walletId: null,
  toWalletId: null,
  date: null,
  merchant: 'gojek',
  note: null,
  confidence: 0.8,
  ...over,
});
const rule = (line: string) => parseTransactionLine(line, ctx);

describe('mergeAiGuess', () => {
  it('parser berhasil: nominal/tanggal/dompet/tipe dari parser menang; AI hanya mengisi kategori', () => {
    const out = mergeAiGuess(rule('kemarin zara 50rb gopay'), ai({ amount: 1n, date: '2026-01-01', walletId: 'w-bca', type: 'EXPENSE', categoryId: 'cat-expense-hiburan' }), options);
    expect(out.ok && out.draft).toMatchObject({ amount: 50_000n, date: '2026-10-22', walletId: 'w-gopay', categoryId: 'cat-expense-hiburan', merchant: 'zara', aiConfidence: 0.8 });
  });

  it('parser berhasil + AI tidak dipanggil → tanpa label AI', () => {
    const out = mergeAiGuess(rule('zara 50rb'), null, options);
    expect(out.ok && out.draft).toMatchObject({ categoryId: null, aiConfidence: null, walletId: 'w-bca' });
  });

  it('kategori AI bertipe beda dari parser dibuang', () => {
    const out = mergeAiGuess(rule('zara 50rb'), ai({ type: 'INCOME', categoryId: 'cat-income-gaji' }), options);
    expect(out.ok && out.draft).toMatchObject({ categoryId: null, aiConfidence: null });
  });

  it('parser gagal: AI menyediakan nominal; tanggal masa depan diganti hari ini; dompet default dipakai', () => {
    const out = mergeAiGuess(rule('bayar gojek sejuta'), ai({ date: '2027-01-01' }), options);
    expect(out.ok && out.draft).toMatchObject({ amount: 1_000_000n, date: '2026-10-23', walletId: 'w-bca', categoryId: 'cat-expense-transport', aiConfidence: 0.8 });
  });

  it('parser gagal: tanggal AI valid di masa lalu dipakai; format sampah diabaikan', () => {
    const past = mergeAiGuess(rule('bayar gojek sejuta'), ai({ date: '2026-10-20' }), options);
    expect(past.ok && past.draft.date).toBe('2026-10-20');
    const junk = mergeAiGuess(rule('bayar gojek sejuta'), ai({ date: 'kemarin' }), options);
    expect(junk.ok && junk.draft.date).toBe('2026-10-23');
  });

  it('parser gagal & AI tanpa nominal → gagal dengan pesan parser', () => {
    const out = mergeAiGuess(rule('beli sesuatu'), ai({ amount: null }), options);
    expect(out).toEqual({ ok: false, message: expect.stringContaining('Nominal tidak ditemukan') });
    expect(mergeAiGuess(rule('beli sesuatu'), null, options).ok).toBe(false);
  });

  it('transfer dari AI wajib dua dompet berbeda', () => {
    const ok = mergeAiGuess(rule('pindahin sejuta'), ai({ type: 'TRANSFER', categoryId: null, walletId: 'w-bca', toWalletId: 'w-gopay' }), options);
    expect(ok.ok && ok.draft).toMatchObject({ type: 'TRANSFER', walletId: 'w-bca', toWalletId: 'w-gopay', categoryId: null });
    const same = mergeAiGuess(rule('pindahin sejuta'), ai({ type: 'TRANSFER', categoryId: null, walletId: 'w-bca', toWalletId: 'w-bca' }), options);
    expect(same.ok).toBe(false);
    const missing = mergeAiGuess(rule('pindahin sejuta'), ai({ type: 'TRANSFER', categoryId: null, walletId: 'w-bca', toWalletId: null }), options);
    expect(missing.ok).toBe(false);
  });

  it('tanpa dompet default dan AI tidak menyebut dompet → walletId null (bot akan bertanya)', () => {
    const out = mergeAiGuess(rule('bayar gojek sejuta'), ai(), { today: '2026-10-23', defaultWalletId: null });
    expect(out.ok && out.draft.walletId).toBeNull();
  });
});
