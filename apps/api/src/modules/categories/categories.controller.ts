import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CategoryListQuery,
  CategoryListQuerySchema,
  CreateCategoryInput,
  CreateCategorySchema,
  UpdateCategoryInput,
  UpdateCategorySchema,
} from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(CategoryListQuerySchema)) query: CategoryListQuery,
  ) {
    return this.categoriesService.list(user.userId, query.type);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodValidationPipe(CreateCategorySchema)) body: CreateCategoryInput,
  ) {
    return this.categoriesService.create(user.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.categoriesService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.categoriesService.remove(user.userId, id);
  }
}
