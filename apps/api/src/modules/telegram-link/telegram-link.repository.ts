import { Injectable } from '@nestjs/common';
import { Prisma, TelegramLink, TelegramLinkCode, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type LinkWithUser = TelegramLink & { user: { id: string; status: UserStatus } };

@Injectable()
export class TelegramLinkRepository {
  constructor(private prisma: PrismaService) {}

  findByUser(userId: string): Promise<TelegramLink | null> {
    return this.prisma.telegramLink.findUnique({ where: { userId } });
  }

  findByChat(chatId: string): Promise<LinkWithUser | null> {
    return this.prisma.telegramLink.findUnique({
      where: { chatId },
      include: { user: { select: { id: true, status: true } } },
    });
  }

  async deleteByUser(userId: string): Promise<boolean> {
    const { count } = await this.prisma.telegramLink.deleteMany({ where: { userId } });
    return count > 0;
  }

  async deleteByChat(chatId: string): Promise<boolean> {
    const { count } = await this.prisma.telegramLink.deleteMany({ where: { chatId } });
    return count > 0;
  }

  /** Batalkan kode lama yang belum dipakai lalu simpan kode baru (atomik). */
  async replaceCode(userId: string, codeHash: string, expiresAt: Date): Promise<TelegramLinkCode> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.telegramLinkCode.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.telegramLinkCode.create({ data: { userId, codeHash, expiresAt } }),
    ]);
    return created;
  }

  findActiveCode(codeHash: string, now: Date): Promise<TelegramLinkCode | null> {
    return this.prisma.telegramLinkCode.findFirst({
      where: { codeHash, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Buat link dan tandai kode terpakai dalam satu transaksi. */
  async linkAndConsume(codeId: string, userId: string, chatId: string, username: string | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.telegramLink.create({ data: { userId, chatId, username } }),
      this.prisma.telegramLinkCode.update({ where: { id: codeId }, data: { usedAt: new Date() } }),
    ]);
  }

  async deleteExpiredCodes(before: Date): Promise<number> {
    const { count } = await this.prisma.telegramLinkCode.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { usedAt: { not: null }, createdAt: { lt: before } }] },
    });
    return count;
  }

  static isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
