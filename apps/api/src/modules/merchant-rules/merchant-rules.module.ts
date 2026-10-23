import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { MerchantRulesRepository } from './merchant-rules.repository';
import { MerchantRulesService } from './merchant-rules.service';

@Module({
  imports: [CategoriesModule],
  providers: [MerchantRulesService, MerchantRulesRepository],
  exports: [MerchantRulesService],
})
export class MerchantRulesModule {}
