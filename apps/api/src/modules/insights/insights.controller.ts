import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { MonthStringSchema } from 'shared';
import { CurrentUser } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../common/types';
import { InsightsService } from './insights.service';

const MonthQuerySchema = z.object({ month: MonthStringSchema.optional() });
const RefreshSchema = z.object({ month: MonthStringSchema.optional() });

@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  /** Insight tersimpan; `{ insight: null }` bila belum pernah dibuat untuk bulan itu. */
  @Get()
  async get(@CurrentUser() user: CurrentUserData, @Query(new ZodValidationPipe(MonthQuerySchema)) query: { month?: string }) {
    return { insight: await this.insights.get(user.userId, query.month) };
  }

  /** Tombol "Perbarui": generate ulang (kena kuota harian). */
  @Post('refresh')
  refresh(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(RefreshSchema)) body: { month?: string }) {
    return this.insights.generate(user.userId, body.month);
  }
}
