import { Module } from '@nestjs/common';
import { SavingsController } from './savings.controller';
import { SavingsService } from './savings.service';
import { SavingsRepository } from './savings.repository';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [WalletsModule],
  controllers: [SavingsController],
  providers: [SavingsService, SavingsRepository],
  exports: [SavingsService],
})
export class SavingsModule {}
