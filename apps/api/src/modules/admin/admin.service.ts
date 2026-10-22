import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { AuditLogRepository } from './audit-log.repository';

@Injectable()
export class AdminService {
  constructor(
    private usersService: UsersService,
    private refreshTokenRepository: RefreshTokenRepository,
    private auditLogRepository: AuditLogRepository,
  ) {}

  async approveUser(adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      throw new ForbiddenException('Tidak bisa approve akun sendiri');
    }

    const user = await this.usersService.getUserById(targetUserId);

    if (user.status !== 'PENDING') {
      throw new BadRequestException('Hanya user dengan status PENDING yang bisa di-approve');
    }

    const updated = await this.usersService.updateUser(targetUserId, {
      status: 'ACTIVE',
      approvedAt: new Date(),
      approvedBy: { connect: { id: adminId } },
    });

    await this.auditLogRepository.create(adminId, targetUserId, 'APPROVE');

    return updated;
  }

  async rejectUser(adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      throw new ForbiddenException('Tidak bisa reject akun sendiri');
    }

    const user = await this.usersService.getUserById(targetUserId);

    if (user.status !== 'PENDING') {
      throw new BadRequestException('Hanya user dengan status PENDING yang bisa di-reject');
    }

    await this.refreshTokenRepository.revokeAllForUser(targetUserId);

    const updated = await this.usersService.updateUser(targetUserId, {
      status: 'REJECTED',
    });

    await this.auditLogRepository.create(adminId, targetUserId, 'REJECT');

    return updated;
  }

  async suspendUser(adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      throw new ForbiddenException('Tidak bisa suspend akun sendiri');
    }

    const user = await this.usersService.getUserById(targetUserId);

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Hanya user dengan status ACTIVE yang bisa di-suspend');
    }

    await this.refreshTokenRepository.revokeAllForUser(targetUserId);

    const updated = await this.usersService.updateUser(targetUserId, {
      status: 'SUSPENDED',
    });

    await this.auditLogRepository.create(adminId, targetUserId, 'SUSPEND');

    return updated;
  }

  async reactivateUser(adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      throw new ForbiddenException('Tidak bisa reactivate akun sendiri');
    }

    const user = await this.usersService.getUserById(targetUserId);

    if (user.status !== 'SUSPENDED' && user.status !== 'REJECTED') {
      throw new BadRequestException('Hanya user dengan status SUSPENDED atau REJECTED yang bisa di-reactivate');
    }

    const updated = await this.usersService.updateUser(targetUserId, {
      status: 'ACTIVE',
    });

    await this.auditLogRepository.create(adminId, targetUserId, 'REACTIVATE');

    return updated;
  }

  async getAllUsers(status?: string) {
    const where: Prisma.UserWhereInput | undefined = status
      ? { status: status as UserStatus }
      : undefined;
    return this.usersService.getAllUsers(where);
  }

  async getStats() {
    const all = await this.usersService.getAllUsers();
    const stats = {
      PENDING: 0,
      ACTIVE: 0,
      REJECTED: 0,
      SUSPENDED: 0,
    };

    for (const user of all) {
      stats[user.status as keyof typeof stats]++;
    }

    return stats;
  }
}
