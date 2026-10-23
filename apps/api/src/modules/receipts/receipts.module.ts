import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClient } from '../ai/llm-client.service';
import { PromptService } from '../ai/prompt.service';
import { CategoriesModule } from '../categories/categories.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { WalletsModule } from '../wallets/wallets.module';
import { OcrReceiptParser } from './ocr-receipt.parser';
import { RECEIPT_PARSER } from './receipt-parser';
import { ReceiptStorageService } from './receipt-storage.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsRepository } from './receipts.repository';
import { ReceiptsService } from './receipts.service';
import { TesseractOcrEngine } from './tesseract-ocr.engine';
import { VisionReceiptParser } from './vision-receipt.parser';

@Module({
  imports: [CategoriesModule, MerchantRulesModule, WalletsModule],
  controllers: [ReceiptsController],
  providers: [
    ReceiptsService,
    ReceiptsRepository,
    ReceiptStorageService,
    TesseractOcrEngine,
    OcrReceiptParser,
    {
      provide: RECEIPT_PARSER,
      inject: [ConfigService, OcrReceiptParser, LlmClient, PromptService],
      useFactory: (config: ConfigService, ocr: OcrReceiptParser, llm: LlmClient, prompts: PromptService) => {
        const logger = new Logger('ReceiptParser');
        const model = config.get<string>('RECEIPT_VISION_MODEL')?.trim();
        if (config.get<string>('RECEIPT_PARSER') === 'vision') {
          if (model) {
            logger.log(`Parser struk: vision (${model}).`);
            return new VisionReceiptParser(llm, prompts, model);
          }
          logger.warn('RECEIPT_PARSER=vision tetapi RECEIPT_VISION_MODEL kosong; memakai OCR.');
        }
        return ocr;
      },
    },
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
