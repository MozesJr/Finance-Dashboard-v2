import { Global, Module } from '@nestjs/common';
import { PeriodsController } from './periods.controller';
import { PeriodsRepository } from './periods.repository';
import { PeriodsService } from './periods.service';

@Global()
@Module({
  controllers: [PeriodsController],
  providers: [PeriodsService, PeriodsRepository],
  exports: [PeriodsService, PeriodsRepository],
})
export class PeriodsModule {}
