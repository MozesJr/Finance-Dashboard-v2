import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MerchantRulesService } from './merchant-rules.service';
import { MerchantRulesRepository } from './merchant-rules.repository';
import { CategoriesService } from '../categories/categories.service';

describe('MerchantRulesService', () => {
  let repo: jest.Mocked<MerchantRulesRepository>;
  let categories: jest.Mocked<CategoriesService>;
  let service: MerchantRulesService;

  beforeEach(() => {
    repo = { findAll: jest.fn(), upsert: jest.fn() } as unknown as jest.Mocked<MerchantRulesRepository>;
    categories = { getVisible: jest.fn().mockResolvedValue({ id: 'c1' }) } as unknown as jest.Mocked<CategoriesService>;
    service = new MerchantRulesService(repo, categories);
  });

  it('list memetakan ke {pattern, categoryId} milik user', async () => {
    repo.findAll.mockResolvedValue([{ merchantPattern: 'starbucks', categoryId: 'c1' }] as never);
    expect(await service.list('u1')).toEqual([{ pattern: 'starbucks', categoryId: 'c1' }]);
    expect(repo.findAll).toHaveBeenCalledWith('u1');
  });

  it('learn: pola dinormalkan huruf kecil dan di-upsert per user', async () => {
    await service.learn('u1', '  Starbucks ', 'c1');
    expect(categories.getVisible).toHaveBeenCalledWith('u1', 'c1');
    expect(repo.upsert).toHaveBeenCalledWith('u1', 'starbucks', 'c1');
  });

  it('learn: kategori milik user lain → 404, tidak menyimpan', async () => {
    categories.getVisible.mockRejectedValue(new NotFoundException('Kategori tidak ditemukan'));
    await expect(service.learn('u1', 'kopi', 'orang-lain')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('learn: pola kosong / terlalu panjang ditolak', async () => {
    await expect(service.learn('u1', '   ', 'c1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.learn('u1', 'x'.repeat(81), 'c1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
