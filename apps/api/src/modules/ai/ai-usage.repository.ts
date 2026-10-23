import { Injectable } from '@nestjs/common';
import { AiFeature } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AiUsageRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    feature: AiFeature;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    success: boolean;
  }): Promise<void> {
    await this.prisma.aiUsage.create({ data });
  }

  count(userId: string, feature: AiFeature, since: Date): Promise<number> {
    return this.prisma.aiUsage.count({ where: { userId, feature, createdAt: { gte: since } } });
  }
}
