import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AuditLogRepository {
  constructor(private prisma: PrismaService) {}

  async create(adminId: string, targetUserId: string, action: string, details?: any) {
    return (this.prisma as any).auditLog.create({
      data: {
        adminId,
        targetUserId,
        action,
        details,
      },
    });
  }

  async findByTargetUser(targetUserId: string) {
    return (this.prisma as any).auditLog.findMany({
      where: { targetUserId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
