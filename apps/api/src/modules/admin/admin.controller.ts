import {
  Controller,
  Get,
  Patch,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { AdminUsersQuerySchema, AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../common/types';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  async getUsers(@Query(new ZodValidationPipe(AdminUsersQuerySchema)) query: AdminUsersQueryDto) {
    return this.adminService.getAllUsers(query.status);
  }

  @Patch('users/:id/approve')
  async approveUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.adminService.approveUser(user.userId, targetUserId);
  }

  @Patch('users/:id/reject')
  async rejectUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.adminService.rejectUser(user.userId, targetUserId);
  }

  @Patch('users/:id/suspend')
  async suspendUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.adminService.suspendUser(user.userId, targetUserId);
  }

  @Patch('users/:id/reactivate')
  async reactivateUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.adminService.reactivateUser(user.userId, targetUserId);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }
}
