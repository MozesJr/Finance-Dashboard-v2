import {
  Controller,
  Get,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { AdminUsersQuerySchema } from './dto/admin-users-query.dto';
import { UserApprovalDtoSchema } from './dto/user-approval.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  async getUsers(@Query() query: any) {
    try {
      const validated = AdminUsersQuerySchema.parse(query);
      return this.adminService.getAllUsers(validated.status);
    } catch (error) {
      throw new BadRequestException('Validasi gagal');
    }
  }

  @Patch('users/:id/approve')
  async approveUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.approveUser(user.userId, targetUserId);
  }

  @Patch('users/:id/reject')
  async rejectUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.rejectUser(user.userId, targetUserId);
  }

  @Patch('users/:id/suspend')
  async suspendUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.suspendUser(user.userId, targetUserId);
  }

  @Patch('users/:id/reactivate')
  async reactivateUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.reactivateUser(user.userId, targetUserId);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }
}
