import { Injectable } from '@nestjs/common';
import { AiChatRole } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface ChatMessageRow {
  id: string;
  role: AiChatRole;
  content: string;
  createdAt: Date;
}

@Injectable()
export class AiChatRepository {
  constructor(private prisma: PrismaService) {}

  /** Pesan terbaru, urut lama → baru. */
  async recent(userId: string, limit: number): Promise<ChatMessageRow[]> {
    const rows = await this.prisma.aiChatMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return rows.reverse();
  }

  async addExchange(userId: string, userText: string, assistantText: string): Promise<void> {
    const now = Date.now();
    await this.prisma.aiChatMessage.createMany({
      data: [
        { userId, role: 'USER', content: userText, createdAt: new Date(now) },
        { userId, role: 'ASSISTANT', content: assistantText, createdAt: new Date(now + 1) },
      ],
    });
  }

  /** Simpan hanya `keep` pesan terbaru per user. */
  async prune(userId: string, keep: number): Promise<void> {
    const boundary = await this.prisma.aiChatMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: keep,
      take: 1,
      select: { createdAt: true },
    });
    if (boundary.length === 0) return;
    await this.prisma.aiChatMessage.deleteMany({ where: { userId, createdAt: { lte: boundary[0].createdAt } } });
  }

  async clear(userId: string): Promise<number> {
    const { count } = await this.prisma.aiChatMessage.deleteMany({ where: { userId } });
    return count;
  }
}
