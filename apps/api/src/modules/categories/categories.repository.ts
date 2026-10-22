import { Injectable } from '@nestjs/common';
import { Category, CategoryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private prisma: PrismaService) {}

  /** Kategori sistem (userId null) + milik user. */
  findVisible(userId: string, type?: CategoryType): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }], ...(type ? { type } : {}) },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  findVisibleById(userId: string, id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { id, OR: [{ userId: null }, { userId }] },
    });
  }

  findOwnByName(userId: string, name: string): Promise<Category | null> {
    return this.prisma.category.findFirst({ where: { userId, name } });
  }

  create(userId: string, data: Omit<Prisma.CategoryUncheckedCreateInput, 'userId' | 'isSystem'>): Promise<Category> {
    return this.prisma.category.create({ data: { ...data, userId, isSystem: false } });
  }

  async update(userId: string, id: string, data: Prisma.CategoryUpdateInput): Promise<void> {
    await this.prisma.category.updateMany({ where: { id, userId }, data });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.category.deleteMany({ where: { id, userId } });
  }

  async isUsed(userId: string, id: string): Promise<boolean> {
    const count = await this.prisma.transaction.count({ where: { userId, categoryId: id } });
    return count > 0;
  }
}
