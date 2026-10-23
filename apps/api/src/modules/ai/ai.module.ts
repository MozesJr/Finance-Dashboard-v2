import { Global, Module } from '@nestjs/common';
import { AiUsageRepository } from './ai-usage.repository';
import { AiUsageService } from './ai-usage.service';
import { LlmClient } from './llm-client.service';
import { PromptService } from './prompt.service';

@Global()
@Module({
  providers: [LlmClient, PromptService, AiUsageService, AiUsageRepository],
  exports: [LlmClient, PromptService, AiUsageService],
})
export class AiModule {}
