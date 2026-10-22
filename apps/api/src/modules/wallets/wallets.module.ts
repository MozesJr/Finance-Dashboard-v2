import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';

@Module({
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService],
})
export class WalletsModule {}
