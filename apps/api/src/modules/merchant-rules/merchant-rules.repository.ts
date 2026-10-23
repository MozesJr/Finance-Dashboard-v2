import { Injectable } from '@nestjs/common';
import { MerchantCategoryRule } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MerchantRulesRepository {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string): Promise<MerchantCategoryRule[]> {
    return this.prisma.merchantCategoryRule.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  }

  upsert(userId: string, merchantPattern: string, categoryId: string): Promise<MerchantCategoryRule> {
    return this.prisma.merchantCategoryRule.upsert({
      where: { userId_merchantPattern: { userId, merchantPattern } },
      create: { userId, merchantPattern, categoryId },
      update: { categoryId },
    });
  }
}
