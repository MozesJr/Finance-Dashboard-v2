import type { ReceiptExtraction } from 'shared';
import type { UsageMeter } from '../ai/usage-meter';

export interface ParsedReceiptData {
  /** Teks OCR mentah (null untuk parser vision). */
  ocrText: string | null;
  extraction: ReceiptExtraction;
}

/** Strategi baca struk yang bisa ditukar: OCR→LLM atau vision. */
export interface ReceiptParser {
  readonly kind: 'ocr' | 'vision';
  parse(image: Buffer, today: string, meter?: UsageMeter): Promise<ParsedReceiptData>;
}

export const RECEIPT_PARSER = Symbol('RECEIPT_PARSER');
