import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { parseUuid } from '../../common/pipes/parse-uuid.pipe';
import {
  CreateWalletInput,
  CreateWalletSchema,
  UpdateWalletInput,
  UpdateWalletSchema,
  WalletListQuery,
  WalletListQuerySchema,
  WalletValuationInput,
  WalletValuationSchema,
} from './dto/wallet.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(WalletListQuerySchema)) query: WalletListQuery,
  ) {
    return this.walletsService.list(user.userId, query.includeArchived);
  }

  /** Didaftarkan sebelum ':id' agar "investments" tidak dianggap id. */
  @Get('investments/summary')
  investmentSummary(@CurrentUser() user: CurrentUserData) {
    return this.walletsService.investmentSummary(user.userId);
  }

  @Get(':id/valuations')
  valuations(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    return this.walletsService.listValuations(user.userId, id);
  }

  @Post(':id/valuation')
  setValuation(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(WalletValuationSchema)) body: WalletValuationInput,
  ) {
    return this.walletsService.setValuation(user.userId, id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    return this.walletsService.get(user.userId, id);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodValidationPipe(CreateWalletSchema)) body: CreateWalletInput,
  ) {
    return this.walletsService.create(user.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', parseUuid()) id: string,
    @Body(new ZodValidationPipe(UpdateWalletSchema)) body: UpdateWalletInput,
  ) {
    return this.walletsService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    await this.walletsService.remove(user.userId, id);
  }
}
