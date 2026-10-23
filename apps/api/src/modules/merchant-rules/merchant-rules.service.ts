import { BadRequestException, Injectable } from '@nestjs/common';
import { CategoryRule } from 'shared';
import { CategoriesService } from '../categories/categories.service';
import { MerchantRulesRepository } from './merchant-rules.repository';

const MAX_PATTERN_LENGTH = 80;

/** Rule "belajar dari koreksi user": kata kunci ternormalisasi → kategori. */
@Injectable()
export class MerchantRulesService {
  constructor(
    private repository: MerchantRulesRepository,
    private categories: CategoriesService,
  ) {}

  async list(userId: string): Promise<CategoryRule[]> {
    const rules = await this.repository.findAll(userId);
    return rules.map((r) => ({ pattern: r.merchantPattern, categoryId: r.categoryId }));
  }

  /** Simpan/perbarui rule. Kategori harus terlihat oleh user (sistem atau milik sendiri), selain itu 404. */
  async learn(userId: string, pattern: string, categoryId: string): Promise<void> {
    const normalized = pattern.trim().toLowerCase();
    if (normalized === '' || normalized.length > MAX_PATTERN_LENGTH) {
      throw new BadRequestException('Kata kunci rule tidak valid.');
    }
    await this.categories.getVisible(userId, categoryId);
    await this.repository.upsert(userId, normalized, categoryId);
  }
}
