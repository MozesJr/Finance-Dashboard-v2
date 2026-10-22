import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { CreateUserInput, User } from 'shared';

export function toUserResponse(user: {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  approvedAt: Date | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    approvedAt: user.approvedAt,
    approvedById: user.approvedById,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private usersRepository: UsersRepository) {}

  async createUser(input: CreateUserInput) {
    const existing = await this.usersRepository.findByEmail(input.email);
    if (existing) {
      throw new BadRequestException('Email sudah terdaftar');
    }

    return this.usersRepository.create({
      email: input.email,
      passwordHash: '', // Will be set by AuthService
      role: 'USER',
      status: 'PENDING',
    });
  }

  async getUserById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    return user;
  }

  async getUserByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async getUserByEmailWithPassword(email: string) {
    return this.usersRepository.findByEmailWithPassword(email);
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput) {
    return this.usersRepository.update(id, data);
  }

  async getAllUsers(where?: Prisma.UserWhereInput) {
    return this.usersRepository.findAll(where);
  }
}
