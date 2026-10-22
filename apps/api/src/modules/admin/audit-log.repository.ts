import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AuditLogRepository {
  constructor(private prisma: PrismaService) {}

  async create(adminId: string, targetUserId: string, action: string, details?: Prisma.InputJsonValue) {
    return (this.prisma as PrismaClient).auditLog.create({
      data: {
        adminId,
        targetUserId,
        action,
        details,
      },
    });
  }

  async findByTargetUser(targetUserId: string) {
    return (this.prisma as PrismaClient).auditLog.findMany({
      where: { targetUserId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
