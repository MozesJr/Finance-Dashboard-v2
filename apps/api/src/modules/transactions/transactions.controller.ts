import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { parseUuid } from '../../common/pipes/parse-uuid.pipe';
import {
  CreateTransactionInput,
  CreateTransactionSchema,
  TransactionListQuery,
  TransactionListQuerySchema,
  UpdateTransactionInput,
  UpdateTransactionSchema,
} from './dto/transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(TransactionListQuerySchema)) query: TransactionListQuery,
  ) {
    return this.transactionsService.list(user.userId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    return this.transactionsService.get(user.userId, id);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodValidationPipe(CreateTransactionSchema)) body: CreateTransactionInput,
  ) {
    return this.transactionsService.create(user.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(UpdateTransactionSchema)) body: UpdateTransactionInput,
  ) {
    return this.transactionsService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    await this.transactionsService.remove(user.userId, id);
  }
}
