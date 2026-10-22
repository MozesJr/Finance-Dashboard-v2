import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma, PrismaClient } from '@prisma/client';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  approvedAt: true,
  approvedById: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput) {
    return (this.prisma as PrismaClient).user.create({
      data,
      select: SAFE_USER_SELECT,
    });
  }

  async findById(id: string) {
    return (this.prisma as PrismaClient).user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
  }

  async findByEmail(email: string) {
    return (this.prisma as PrismaClient).user.findUnique({
      where: { email },
      select: SAFE_USER_SELECT,
    });
  }

  async findByEmailWithPassword(email: string) {
    return (this.prisma as PrismaClient).user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return (this.prisma as PrismaClient).user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }

  async findAll(where?: Prisma.UserWhereInput) {
    return (this.prisma as PrismaClient).user.findMany({
      where,
      select: SAFE_USER_SELECT,
    });
  }
}
