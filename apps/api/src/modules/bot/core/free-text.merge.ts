import type { ParseResult } from 'shared';
import type { AiTransactionResult } from '../../ai/ai-transaction.parser';

export interface MergedDraft {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: bigint;
  date: string;
  walletId: string | null;
  toWalletId: string | null;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  /** Terisi bila AI ikut berkontribusi (untuk label "ditebak AI"). */
  aiConfidence: number | null;
}

export type MergeOutcome = { ok: true; draft: MergedDraft } | { ok: false; message: string };

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Gabungkan hasil parser aturan dengan tebakan AI. Prinsip: nilai deterministik dari parser
 * (nominal, tanggal, dompet yang disebut, tipe) didahulukan; AI mengisi yang kosong.
 * Kategori dari AI hanya dipakai bila tipenya cocok (sudah divalidasi saat parse).
 */
export function mergeAiGuess(
  rule: ParseResult,
  ai: AiTransactionResult | null,
  options: { today: string; defaultWalletId: string | null },
): MergeOutcome {
  const { today, defaultWalletId } = options;

  if (rule.ok) {
    const tx = rule.tx;
    const aiCategory = ai && ai.type === tx.type && tx.type !== 'TRANSFER' ? ai.categoryId : null;
    return {
      ok: true,
      draft: {
        type: tx.type,
        amount: tx.amount,
        date: tx.date,
        walletId: tx.walletId ?? ai?.walletId ?? defaultWalletId,
        toWalletId: tx.toWalletId,
        categoryId: aiCategory,
        merchant: tx.description || ai?.merchant || null,
        note: ai?.note ?? null,
        aiConfidence: aiCategory ? (ai?.confidence ?? null) : null,
      },
    };
  }

  // Parser gagal: AI harus menyediakan nominal.
  if (!ai || ai.amount === null || ai.amount <= 0n) return { ok: false, message: rule.message };

  const date = ai.date && isoDate.test(ai.date) && ai.date <= today ? ai.date : today;
  if (ai.type === 'TRANSFER') {
    const from = ai.walletId;
    const to = ai.toWalletId;
    if (!from || !to || from === to) {
      return { ok: false, message: 'Transfer: sebutkan dompet asal dan tujuan, mis. "transfer 500rb bca ke gopay".' };
    }
    return {
      ok: true,
      draft: { type: 'TRANSFER', amount: ai.amount, date, walletId: from, toWalletId: to, categoryId: null, merchant: ai.merchant ?? 'Transfer', note: ai.note, aiConfidence: ai.confidence },
    };
  }

  return {
    ok: true,
    draft: {
      type: ai.type,
      amount: ai.amount,
      date,
      walletId: ai.walletId ?? defaultWalletId,
      toWalletId: null,
      categoryId: ai.categoryId,
      merchant: ai.merchant,
      note: ai.note,
      aiConfidence: ai.confidence,
    },
  };
}
