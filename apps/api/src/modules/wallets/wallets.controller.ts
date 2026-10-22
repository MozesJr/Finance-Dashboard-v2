import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateWalletInput,
  CreateWalletSchema,
  UpdateWalletInput,
  UpdateWalletSchema,
  WalletListQuery,
  WalletListQuerySchema,
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

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateWalletSchema)) body: UpdateWalletInput,
  ) {
    return this.walletsService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    await this.walletsService.remove(user.userId, id);
  }
}
