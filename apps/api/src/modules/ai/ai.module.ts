import { Global, Module } from '@nestjs/common';
import { AiUsageRepository } from './ai-usage.repository';
import { AiUsageService } from './ai-usage.service';
import { AiTransactionParser } from './ai-transaction.parser';
import { LlmClient } from './llm-client.service';
import { PromptService } from './prompt.service';

@Global()
@Module({
  providers: [LlmClient, PromptService, AiUsageService, AiUsageRepository, AiTransactionParser],
  exports: [LlmClient, PromptService, AiUsageService, AiTransactionParser],
})
export class AiModule {}
