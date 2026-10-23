import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiFeature } from '@prisma/client';
import { AiQuotaError } from './ai.errors';
import { AiUsageRepository } from './ai-usage.repository';
import { UsageMeter } from './usage-meter';

const DEFAULT_LIMITS: Record<AiFeature, number> = { CHAT: 30, INSIGHT: 5, RECEIPT: 30, PARSE: 50 };
const ENV_KEYS: Record<AiFeature, string> = {
  CHAT: 'AI_LIMIT_CHAT_PER_DAY',
  INSIGHT: 'AI_LIMIT_INSIGHT_PER_DAY',
  RECEIPT: 'AI_LIMIT_RECEIPT_PER_DAY',
  PARSE: 'AI_LIMIT_PARSE_PER_DAY',
};

/** Awal hari ini di Asia/Jakarta sebagai instan UTC. */
export function startOfJakartaDay(now: Date = new Date()): Date {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(now); // YYYY-MM-DD
  return new Date(`${today}T00:00:00+07:00`);
}

/** Kuota harian per user per fitur + pencatatan pemakaian (tanpa isi prompt/respons). */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    private repository: AiUsageRepository,
    private config: ConfigService,
  ) {}

  limitFor(feature: AiFeature): number {
    const raw = Number(this.config.get<string>(ENV_KEYS[feature]));
    return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_LIMITS[feature];
  }

  async assertAllowed(userId: string, feature: AiFeature): Promise<void> {
    const limit = this.limitFor(feature);
    const used = await this.repository.count(userId, feature, startOfJakartaDay());
    if (used >= limit) throw new AiQuotaError(limit);
  }

  /**
   * Jalankan satu permintaan AI milik user: cek kuota, ukur pemakaian, catat hasil (sukses/gagal).
   * skipQuota untuk job terjadwal.
   */
  async track<T>(
    userId: string,
    feature: AiFeature,
    fn: (meter: UsageMeter) => Promise<T>,
    options: { skipQuota?: boolean } = {},
  ): Promise<T> {
    if (!options.skipQuota) await this.assertAllowed(userId, feature);
    const meter = new UsageMeter();
    let success = false;
    try {
      const result = await fn(meter);
      success = true;
      return result;
    } finally {
      try {
        await this.repository.create({
          userId,
          feature,
          promptTokens: meter.promptTokens,
          completionTokens: meter.completionTokens,
          latencyMs: meter.latencyMs,
          success,
        });
      } catch (error) {
        this.logger.warn(`Gagal mencatat pemakaian AI: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
  }
}
