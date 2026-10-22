import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RefreshTokenRepository {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, tokenHash: string, expiresAt: Date) {
    return (this.prisma as PrismaClient).refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string) {
    return (this.prisma as PrismaClient).refreshToken.findUnique({ where: { tokenHash } });
  }

  async markAsRevoked(tokenHash: string, replacedById?: string) {
    const data: Prisma.RefreshTokenUpdateInput = { revokedAt: new Date() };
    if (replacedById) {
      data.replacedById = replacedById;
    }
    return (this.prisma as PrismaClient).refreshToken.update({
      where: { tokenHash },
      data,
    });
  }

  async revokeAllForUser(userId: string) {
    return (this.prisma as PrismaClient).refreshToken.updateMany({
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
    return (this.prisma as PrismaClient).refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }
}
