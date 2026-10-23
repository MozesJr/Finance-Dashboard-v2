import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Wallet } from '@prisma/client';
import { WalletsRepository } from './wallets.repository';
import { CreateWalletInput, UpdateWalletInput } from './dto/wallet.dto';

export interface WalletResponse {
  id: string;
  name: string;
  type: string;
  color: string | null;
  isArchived: boolean;
  isDefault: boolean;
  initialBalance: string;
  balance: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WalletsService {
  constructor(private repository: WalletsRepository) {}

  async list(userId: string, includeArchived = false): Promise<WalletResponse[]> {
    const [wallets, deltas] = await Promise.all([
      this.repository.findAll(userId, includeArchived),
      this.repository.getBalanceDeltas(userId),
    ]);
    return wallets.map((w) => this.toResponse(w, deltas.get(w.id) ?? 0n));
  }

  async get(userId: string, id: string): Promise<WalletResponse> {
    const wallet = await this.getOwned(userId, id);
    const deltas = await this.repository.getBalanceDeltas(userId);
    return this.toResponse(wallet, deltas.get(id) ?? 0n);
  }

  async create(userId: string, input: CreateWalletInput): Promise<WalletResponse> {
    const wallet = await this.repository.create(userId, {
      name: input.name,
      type: input.type,
      initialBalance: input.initialBalance,
      color: input.color ?? null,
    });
    if (input.isDefault) {
      await this.repository.setDefault(userId, wallet.id);
      return this.get(userId, wallet.id);
    }
    return this.toResponse(wallet, 0n);
  }

  async update(userId: string, id: string, input: UpdateWalletInput): Promise<WalletResponse> {
    const existing = await this.getOwned(userId, id);
    const { isDefault, ...rest } = input;
    const willBeArchived = input.isArchived ?? existing.isArchived;
    if (isDefault === true && willBeArchived) {
      throw new BadRequestException('Dompet yang diarsipkan tidak bisa dijadikan default.');
    }
    // Mengarsipkan dompet default mencabut status defaultnya.
    const data = input.isArchived === true && existing.isDefault ? { ...rest, isDefault: false } : isDefault === false ? { ...rest, isDefault: false } : rest;
    if (Object.keys(data).length > 0) {
      const updated = await this.repository.update(userId, id, data);
      if (!updated) throw new NotFoundException('Wallet tidak ditemukan');
    }
    if (isDefault === true) await this.repository.setDefault(userId, id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    if (await this.repository.hasTransactions(userId, id)) {
      throw new ConflictException(
        'Wallet sudah memiliki transaksi dan tidak bisa dihapus. Arsipkan wallet ini sebagai gantinya.',
      );
    }
    await this.repository.delete(userId, id);
  }

  /** Dompet default aktif milik user (null bila belum diatur). */
  findDefault(userId: string): Promise<Wallet | null> {
    return this.repository.findDefault(userId);
  }

  /** Dipakai modul transaksi: wallet harus milik user (else 404); opsional harus aktif. */
  async getOwned(userId: string, id: string): Promise<Wallet> {
    const wallet = await this.repository.findById(userId, id);
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');
    return wallet;
  }

  private toResponse(wallet: Wallet, delta: bigint): WalletResponse {
    return {
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
      color: wallet.color,
      isArchived: wallet.isArchived,
      isDefault: wallet.isDefault,
      initialBalance: wallet.initialBalance.toString(),
      balance: (wallet.initialBalance + delta).toString(),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }
}
