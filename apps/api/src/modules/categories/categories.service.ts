import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Category, CategoryType, Prisma } from '@prisma/client';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryInput, UpdateCategoryInput } from './dto/category.dto';

export interface CategoryResponse {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  createdAt: Date;
}

@Injectable()
export class CategoriesService {
  constructor(private repository: CategoriesRepository) {}

  async list(userId: string, type?: CategoryType): Promise<CategoryResponse[]> {
    const categories = await this.repository.findVisible(userId, type);
    return categories.map(toResponse);
  }

  async get(userId: string, id: string): Promise<CategoryResponse> {
    return toResponse(await this.getVisible(userId, id));
  }

  async create(userId: string, input: CreateCategoryInput): Promise<CategoryResponse> {
    await this.assertNameFree(userId, input.name);
    try {
      const created = await this.repository.create(userId, {
        name: input.name,
        type: input.type,
        icon: input.icon ?? null,
        color: input.color ?? null,
      });
      return toResponse(created);
    } catch (error) {
      throw this.mapDuplicate(error);
    }
  }

  async update(userId: string, id: string, input: UpdateCategoryInput): Promise<CategoryResponse> {
    const category = await this.getOwnedMutable(userId, id);
    if (input.name !== undefined && input.name !== category.name) {
      await this.assertNameFree(userId, input.name);
    }
    try {
      await this.repository.update(userId, id, input);
    } catch (error) {
      throw this.mapDuplicate(error);
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwnedMutable(userId, id);
    if (await this.repository.isUsed(userId, id)) {
      throw new ConflictException('Kategori masih dipakai transaksi dan tidak bisa dihapus');
    }
    await this.repository.delete(userId, id);
  }

  /** Dipakai modul transaksi: kategori sistem atau milik user, selain itu 404. */
  async getVisible(userId: string, id: string): Promise<Category> {
    const category = await this.repository.findVisibleById(userId, id);
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    return category;
  }

  private async getOwnedMutable(userId: string, id: string): Promise<Category> {
    const category = await this.getVisible(userId, id);
    if (category.isSystem || category.userId === null) {
      throw new ForbiddenException('Kategori sistem tidak bisa diubah atau dihapus');
    }
    return category;
  }

  private async assertNameFree(userId: string, name: string): Promise<void> {
    if (await this.repository.findOwnByName(userId, name)) {
      throw new ConflictException('Nama kategori sudah dipakai');
    }
  }

  private mapDuplicate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Nama kategori sudah dipakai');
    }
    return error;
  }
}

function toResponse(c: Category): CategoryResponse {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
    isSystem: c.isSystem,
    createdAt: c.createdAt,
  };
}
