import { Injectable } from '@nestjs/common';
import { Prisma, Receipt } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ReceiptsRepository {
  constructor(private prisma: PrismaService) {}

  create(data: { userId: string; filePath: string; mimeType: string; sizeBytes: number }): Promise<Receipt> {
    return this.prisma.receipt.create({ data });
  }

  async markParsed(id: string, ocrText: string | null, parsedJson: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.receipt.update({ where: { id }, data: { status: 'PARSED', ocrText, parsedJson } });
  }

  async markFailed(id: string, ocrText: string | null = null): Promise<void> {
    await this.prisma.receipt.update({ where: { id }, data: { status: 'FAILED', ocrText } });
  }

  findOwned(userId: string, id: string): Promise<Receipt | null> {
    return this.prisma.receipt.findFirst({ where: { id, userId } });
  }
}
