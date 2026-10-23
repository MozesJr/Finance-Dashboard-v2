import { AiTransactionSchema, InsightNarrativeSchema, ReceiptExtractionSchema } from 'shared';
import type { AiSchema } from './llm-client.service';

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const str = { type: 'string' };
const int = { type: 'integer' };

/** JSON schema keluaran teks bebas; kode kategori/dompet dibatasi enum (decoding terkendali). */
export function transactionJsonSchema(categoryKeys: string[], walletKeys: string[]): Record<string, unknown> {
  const keyOrNull = (keys: string[]) => (keys.length > 0 ? nullable({ type: 'string', enum: keys }) : { type: 'null' });
  return {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['EXPENSE', 'INCOME', 'TRANSFER'] },
      amount: nullable(int),
      categoryId: keyOrNull(categoryKeys),
      walletId: keyOrNull(walletKeys),
      toWalletId: keyOrNull(walletKeys),
      date: nullable(str),
      merchant: nullable(str),
      note: nullable(str),
      confidence: { type: 'number' },
    },
    required: ['type', 'amount', 'categoryId', 'walletId', 'toWalletId', 'date', 'merchant', 'note', 'confidence'],
    additionalProperties: false,
  };
}

export const RECEIPT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    merchant: nullable(str),
    date: nullable(str),
    total: int,
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: str, qty: { type: 'number' }, price: int },
        required: ['name', 'qty', 'price'],
        additionalProperties: false,
      },
    },
    paymentMethod: nullable(str),
  },
  required: ['merchant', 'date', 'total', 'items', 'paymentMethod'],
  additionalProperties: false,
};

export const INSIGHT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: str,
    findings: { type: 'array', items: str },
    suggestions: { type: 'array', items: str },
  },
  required: ['summary', 'findings', 'suggestions'],
  additionalProperties: false,
};

export const receiptSchema: AiSchema<ReturnType<typeof ReceiptExtractionSchema.parse>> = {
  name: 'receipt_extraction',
  zod: ReceiptExtractionSchema,
  json: RECEIPT_JSON_SCHEMA,
};

export const insightSchema: AiSchema<ReturnType<typeof InsightNarrativeSchema.parse>> = {
  name: 'insight_narrative',
  zod: InsightNarrativeSchema,
  json: INSIGHT_JSON_SCHEMA,
};

export { AiTransactionSchema };
