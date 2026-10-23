import { Injectable } from '@nestjs/common';
import { LlmClient } from '../ai/llm-client.service';
import { PromptService } from '../ai/prompt.service';
import { receiptSchema } from '../ai/schemas';
import type { UsageMeter } from '../ai/usage-meter';
import { ParsedReceiptData, ReceiptParser } from './receipt-parser';

/** gambar → model vision → JSON. Hanya aktif bila RECEIPT_VISION_MODEL diisi. */
@Injectable()
export class VisionReceiptParser implements ReceiptParser {
  readonly kind = 'vision' as const;

  constructor(
    private llm: LlmClient,
    private prompts: PromptService,
    private model: string,
  ) {}

  async parse(image: Buffer, today: string, meter?: UsageMeter): Promise<ParsedReceiptData> {
    const dataUrl = `data:image/jpeg;base64,${image.toString('base64')}`;
    const extraction = await this.llm.structured({
      model: this.model,
      messages: [
        { role: 'system', content: this.prompts.get('parse-receipt') },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Hari ini: ${today}\nEkstrak struk pada gambar ini.` },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      schema: receiptSchema,
      temperature: 0.1,
      maxTokens: 1500,
      meter,
    });
    return { ocrText: null, extraction };
  }
}
