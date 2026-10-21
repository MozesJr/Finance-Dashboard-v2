import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RefreshTokenRepository {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } as any });
  }

  async markAsRevoked(tokenHash: string, replacedById?: string) {
    const data: any = { revokedAt: new Date() };
    if (replacedById) {
      data.replacedById = replacedById;
    }
    return this.prisma.refreshToken.update({
      where: { tokenHash } as any,
      data,
    });
  }

  async revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async findActiveByUserId(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }
}
