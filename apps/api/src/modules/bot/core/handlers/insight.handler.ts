import { Injectable, Logger } from '@nestjs/common';
import { getCurrentMonthJakarta } from 'shared';
import { AiParseError, AiQuotaError, AiUnavailableError } from '../../../ai/ai.errors';
import { periodLabel } from '../../../insights/insight-narrative';
import { InsightResponse } from '../../../insights/insight.types';
import { InsightsService } from '../../../insights/insights.service';
import { BotReply, BotUser, send } from '../types';

/** Insight yang dibuat dalam 6 jam terakhir dipakai ulang agar tidak boros kuota. */
export const INSIGHT_CACHE_MS = 6 * 60 * 60 * 1000;

export function formatInsight(insight: InsightResponse): string {
  const label = periodLabel(insight.period) + (insight.provisional ? ' (sementara)' : '');
  const lines = [`🧠 Insight ${label}`, insight.narrative.summary, 'Temuan:'];
  insight.narrative.findings.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  lines.push('Saran:');
  insight.narrative.suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  if (insight.source === 'TEMPLATE') lines.push('ℹ️ Ringkasan otomatis (tanpa AI).');
  return lines.join('\n');
}

@Injectable()
export class InsightHandler {
  private readonly logger = new Logger(InsightHandler.name);

  constructor(private insights: InsightsService) {}

  async handle(user: BotUser): Promise<BotReply[]> {
    try {
      const insight = await this.insights.getOrGenerate(user.userId, getCurrentMonthJakarta(), INSIGHT_CACHE_MS);
      return [send(formatInsight(insight))];
    } catch (error) {
      if (error instanceof AiQuotaError) return [send(`ℹ️ ${error.message}`)];
      if (error instanceof AiUnavailableError) return [send('Maaf, insight AI sedang tidak tersedia. Coba lagi nanti. Perintah lain (/bulanini, /alokasi) tetap bisa dipakai.')];
      if (error instanceof AiParseError) return [send('Maaf, insight gagal dibuat. Coba lagi nanti.')];
      this.logger.error(`Insight gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      return [send('Maaf, insight gagal dibuat. Coba lagi nanti.')];
    }
  }
}
