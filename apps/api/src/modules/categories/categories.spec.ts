import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './categories.repository';

const now = new Date('2026-10-01T00:00:00Z');
const cat = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  userId: 'u1',
  name: 'Kopi',
  type: 'EXPENSE',
  icon: null,
  color: null,
  isSystem: false,
  createdAt: now,
  ...over,
});

describe('CategoriesService', () => {
  let repo: jest.Mocked<CategoriesRepository>;
  let service: CategoriesService;

  beforeEach(() => {
    repo = {
      findVisible: jest.fn(),
      findVisibleById: jest.fn(),
      findOwnByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      isUsed: jest.fn(),
    } as unknown as jest.Mocked<CategoriesRepository>;
    service = new CategoriesService(repo);
  });

  it('list meneruskan filter type dan tidak membocorkan userId', async () => {
    repo.findVisible.mockResolvedValue([cat(), cat({ id: 's', userId: null, isSystem: true })] as never);
    const res = await service.list('u1', 'EXPENSE');
    expect(repo.findVisible).toHaveBeenCalledWith('u1', 'EXPENSE');
    expect(res).toHaveLength(2);
    expect(res[0]).not.toHaveProperty('userId');
  });

  it('kategori sistem tidak bisa diubah/dihapus (403)', async () => {
    repo.findVisibleById.mockResolvedValue(cat({ userId: null, isSystem: true }) as never);
    await expect(service.update('u1', 'c1', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('u1', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('kategori user lain → 404', async () => {
    repo.findVisibleById.mockResolvedValue(null);
    await expect(service.update('u1', 'x', { name: 'a' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('kategori yang dipakai transaksi tidak bisa dihapus (409)', async () => {
    repo.findVisibleById.mockResolvedValue(cat() as never);
    repo.isUsed.mockResolvedValue(true);
    await expect(service.remove('u1', 'c1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('kategori tak terpakai bisa dihapus', async () => {
    repo.findVisibleById.mockResolvedValue(cat() as never);
    repo.isUsed.mockResolvedValue(false);
    await service.remove('u1', 'c1');
    expect(repo.delete).toHaveBeenCalledWith('u1', 'c1');
  });

  it('nama duplikat milik user ditolak (409)', async () => {
    repo.findOwnByName.mockResolvedValue(cat() as never);
    await expect(service.create('u1', { name: 'Kopi', type: 'EXPENSE' })).rejects.toBeInstanceOf(ConflictException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create menyimpan sebagai non-sistem milik user', async () => {
    repo.findOwnByName.mockResolvedValue(null);
    repo.create.mockResolvedValue(cat() as never);
    const res = await service.create('u1', { name: 'Kopi', type: 'EXPENSE' });
    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Kopi', type: 'EXPENSE' }));
    expect(res.isSystem).toBe(false);
  });
});
