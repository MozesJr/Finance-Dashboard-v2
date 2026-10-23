import { Injectable } from '@nestjs/common';
import { AiTransactionOutput, AiTransactionSchema } from 'shared';
import { LlmClient, AiSchema } from './llm-client.service';
import { PromptService } from './prompt.service';
import { transactionJsonSchema } from './schemas';
import { UsageMeter } from './usage-meter';

export interface AiParseInput {
  text: string;
  /** YYYY-MM-DD (Asia/Jakarta) */
  today: string;
  categories: Array<{ id: string; name: string; type: 'INCOME' | 'EXPENSE' }>;
  wallets: Array<{ id: string; name: string }>;
}

/** Hasil dengan ID asli milik user (bukan kode alias yang dilihat model). */
export interface AiTransactionResult {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: bigint | null;
  categoryId: string | null;
  walletId: string | null;
  toWalletId: string | null;
  date: string | null;
  merchant: string | null;
  note: string | null;
  confidence: number;
}

const MAX_TEXT = 500;

/**
 * Teks bebas → transaksi via LLM. Model hanya melihat kode alias (c1.., w1..) untuk kategori/dompet;
 * kode di luar daftar menggagalkan validasi (retry 1× lalu AiParseError), jadi ID palsu tidak pernah lolos.
 */
@Injectable()
export class AiTransactionParser {
  constructor(
    private llm: LlmClient,
    private prompts: PromptService,
  ) {}

  /** False bila LLM belum dikonfigurasi (fitur AI dilewati tanpa memakai kuota). */
  get available(): boolean {
    return this.llm.enabled;
  }

  async parse(input: AiParseInput, meter?: UsageMeter): Promise<AiTransactionResult> {
    const categoryByKey = new Map(input.categories.map((c, i) => [`c${i + 1}`, c]));
    const walletByKey = new Map(input.wallets.map((w, i) => [`w${i + 1}`, w.id]));

    const schema: AiSchema<AiTransactionOutput> = {
      name: 'transaction',
      json: transactionJsonSchema([...categoryByKey.keys()], [...walletByKey.keys()]),
      zod: AiTransactionSchema.superRefine((value, ctx) => {
        const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
        if (value.categoryId !== null) {
          const category = categoryByKey.get(value.categoryId);
          if (!category) fail('categoryId', `kode kategori "${value.categoryId}" tidak ada di daftar`);
          else if (category.type !== value.type) fail('categoryId', 'tipe kategori tidak cocok dengan type');
        }
        if (value.walletId !== null && !walletByKey.has(value.walletId)) fail('walletId', `kode dompet "${value.walletId}" tidak ada di daftar`);
        if (value.toWalletId !== null && !walletByKey.has(value.toWalletId)) fail('toWalletId', `kode dompet "${value.toWalletId}" tidak ada di daftar`);
      }),
    };

    const context = [
      `Hari ini: ${input.today}`,
      `Kategori: ${[...categoryByKey].map(([key, c]) => `${key} | ${c.name} | ${c.type}`).join(' ; ') || '(kosong)'}`,
      `Dompet: ${input.wallets.map((w, i) => `w${i + 1} | ${w.name}`).join(' ; ') || '(kosong)'}`,
      `Pesan: ${input.text.slice(0, MAX_TEXT)}`,
    ].join('\n');

    const out = await this.llm.structured({
      messages: [
        { role: 'system', content: this.prompts.get('parse-transaction') },
        { role: 'user', content: context },
      ],
      schema,
      temperature: 0.1,
      maxTokens: 400,
      meter,
    });

    return {
      type: out.type,
      amount: out.amount === null ? null : BigInt(out.amount),
      categoryId: out.type === 'TRANSFER' || out.categoryId === null ? null : (categoryByKey.get(out.categoryId)?.id ?? null),
      walletId: out.walletId === null ? null : (walletByKey.get(out.walletId) ?? null),
      toWalletId: out.type === 'TRANSFER' && out.toWalletId !== null ? (walletByKey.get(out.toWalletId) ?? null) : null,
      date: out.date,
      merchant: out.merchant && out.merchant.trim() !== '' ? out.merchant.trim() : null,
      note: out.note && out.note.trim() !== '' ? out.note.trim() : null,
      confidence: out.confidence,
    };
  }
}
