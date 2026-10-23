import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CreateBillInput, CreateBillSchema, PayBillInput, PayBillSchema, UpdateBillInput, UpdateBillSchema } from 'shared';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { parseUuid } from '../../common/pipes/parse-uuid.pipe';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillsService } from './bills.service';

const ListQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

@Controller('bills')
export class BillsController {
  constructor(private service: BillsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData, @Query(new ZodValidationPipe(ListQuerySchema)) query: { includeInactive: boolean }) {
    return this.service.list(user.userId, query.includeInactive);
  }

  /** Didaftarkan sebelum ':id'. */
  @Get('overview')
  overview(@CurrentUser() user: CurrentUserData) {
    return this.service.overview(user.userId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(CreateBillSchema)) body: CreateBillInput) {
    return this.service.create(user.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(UpdateBillSchema)) body: UpdateBillInput,
  ) {
    return this.service.update(user.userId, id, body);
  }

  @Post(':id/pay')
  pay(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string, @Body(new ZodValidationPipe(PayBillSchema)) body: PayBillInput) {
    return this.service.pay(user.userId, id, body, 'WEB');
  }

  @Get(':id/payments')
  payments(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    return this.service.payments(user.userId, id);
  }
}
