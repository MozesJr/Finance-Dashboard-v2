import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getCurrentMonthJakarta, InsightNarrativeSchema, validateNarrativeNumbers } from 'shared';
import { AiParseError } from '../ai/ai.errors';
import { AiUsageService } from '../ai/ai-usage.service';
import { LlmClient } from '../ai/llm-client.service';
import { PromptService } from '../ai/prompt.service';
import { insightSchema } from '../ai/schemas';
import type { UsageMeter } from '../ai/usage-meter';
import { InsightContent, InsightNarrativeData, InsightResponse, InsightStats } from './insight.types';
import { InsightStatsService } from './insight-stats.service';
import { collectStatNumbers, promptView, templateNarrative } from './insight-narrative';
import { InsightsRepository } from './insights.repository';

const NARRATION_ATTEMPTS = 2;

const allNarrativeText = (n: InsightNarrativeData) => [n.summary, ...n.findings, ...n.suggestions];

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private repository: InsightsRepository,
    private stats: InsightStatsService,
    private llm: LlmClient,
    private prompts: PromptService,
    private usage: AiUsageService,
  ) {}

  /** Insight tersimpan (cache) atau null. Tidak memakai kuota. */
  async get(userId: string, month: string = getCurrentMonthJakarta()): Promise<InsightResponse | null> {
    const row = await this.repository.find(userId, month);
    return row ? this.toResponse(month, row.content as unknown as InsightContent, row.generatedAt) : null;
  }

  /** Generate + simpan. Kena kuota INSIGHT kecuali dipanggil job. */
  async generate(userId: string, month: string = getCurrentMonthJakarta(), options: { skipQuota?: boolean } = {}): Promise<InsightResponse> {
    return this.usage.track(
      userId,
      'INSIGHT',
      async (meter) => {
        const stats = await this.stats.build(userId, month);
        const { narrative, source } = await this.narrate(stats, meter);
        const content: InsightContent = { stats, narrative, source };
        const generatedAt = new Date();
        await this.repository.upsert(userId, month, content as unknown as Prisma.InputJsonValue, generatedAt);
        return this.toResponse(month, content, generatedAt);
      },
      options,
    );
  }

  /** Cache bila masih segar (maxAgeMs), selain itu generate. Dipakai bot (/insight). */
  async getOrGenerate(userId: string, month: string, maxAgeMs: number): Promise<InsightResponse> {
    const cached = await this.get(userId, month);
    if (cached && Date.now() - cached.generatedAt.getTime() <= maxAgeMs) return cached;
    return this.generate(userId, month);
  }

  /**
   * Narasi LLM; setiap nominal Rupiah divalidasi terhadap statistik. Tidak lolos → regenerate 1×,
   * lalu fallback ke ringkasan template tanpa LLM. LLM tidak tersedia → error ramah (AiUnavailableError).
   */
  private async narrate(stats: InsightStats, meter: UsageMeter): Promise<{ narrative: InsightNarrativeData; source: 'LLM' | 'TEMPLATE' }> {
    const allowed = collectStatNumbers(stats);
    const view = JSON.stringify(promptView(stats));
    let correction = '';

    for (let attempt = 0; attempt < NARRATION_ATTEMPTS; attempt++) {
      let narrative: InsightNarrativeData;
      try {
        narrative = await this.llm.structured({
          messages: [
            { role: 'system', content: this.prompts.get('insight-narrate') },
            { role: 'user', content: `Statistik:\n${view}${correction}` },
          ],
          schema: insightSchema,
          temperature: 0.5,
          maxTokens: 900,
          meter,
        });
      } catch (error) {
        if (error instanceof AiParseError) {
          this.logger.warn('Narasi insight tidak valid; memakai ringkasan template.');
          break;
        }
        throw error;
      }

      const check = validateNarrativeNumbers(allNarrativeText(narrative), allowed);
      if (check.ok) return { narrative, source: 'LLM' };

      this.logger.warn(`Narasi insight memuat angka di luar statistik (${check.unknown.length}), percobaan ${attempt + 1}.`);
      correction = `\n\nPERBAIKAN: narasi sebelumnya memuat angka yang tidak ada di statistik (${check.unknown.join(', ')}). Ulangi dan pakai HANYA angka Rupiah yang tertulis di statistik.`;
    }

    const narrative = InsightNarrativeSchema.parse(templateNarrative(stats));
    return { narrative, source: 'TEMPLATE' };
  }

  private toResponse(period: string, content: InsightContent, generatedAt: Date): InsightResponse {
    return {
      period,
      provisional: period === getCurrentMonthJakarta(),
      generatedAt,
      source: content.source,
      stats: content.stats,
      narrative: content.narrative,
    };
  }
}
