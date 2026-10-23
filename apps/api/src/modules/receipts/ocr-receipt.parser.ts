import { BadRequestException, Injectable } from '@nestjs/common';
import { LlmClient } from '../ai/llm-client.service';
import { PromptService } from '../ai/prompt.service';
import { receiptSchema } from '../ai/schemas';
import type { UsageMeter } from '../ai/usage-meter';
import { ParsedReceiptData, ReceiptParser } from './receipt-parser';
import { TesseractOcrEngine } from './tesseract-ocr.engine';

const MIN_OCR_CHARS = 15;
const MAX_OCR_CHARS = 6000;

/** gambar → OCR (Tesseract) → teks → LLM → JSON tervalidasi Zod. */
@Injectable()
export class OcrReceiptParser implements ReceiptParser {
  readonly kind = 'ocr' as const;

  constructor(
    private ocr: TesseractOcrEngine,
    private llm: LlmClient,
    private prompts: PromptService,
  ) {}

  async parse(image: Buffer, today: string, meter?: UsageMeter): Promise<ParsedReceiptData> {
    const ocrText = (await this.ocr.recognize(image)).trim();
    if (ocrText.length < MIN_OCR_CHARS) {
      throw new BadRequestException('Teks pada foto tidak terbaca. Coba foto yang lebih terang, lurus, dan dekat.');
    }
    const extraction = await this.llm.structured({
      messages: [
        { role: 'system', content: this.prompts.get('parse-receipt') },
        { role: 'user', content: `Hari ini: ${today}\nTeks OCR:\n${ocrText.slice(0, MAX_OCR_CHARS)}` },
      ],
      schema: receiptSchema,
      temperature: 0.1,
      maxTokens: 1500,
      meter,
    });
    return { ocrText, extraction };
  }
}
