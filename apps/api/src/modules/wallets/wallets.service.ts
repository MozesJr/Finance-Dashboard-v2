import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Wallet } from '@prisma/client';
import { WalletsRepository } from './wallets.repository';
import { CreateWalletInput, UpdateWalletInput } from './dto/wallet.dto';

export interface WalletResponse {
  id: string;
  name: string;
  type: string;
  color: string | null;
  isArchived: boolean;
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
    return this.toResponse(wallet, 0n);
  }

  async update(userId: string, id: string, input: UpdateWalletInput): Promise<WalletResponse> {
    await this.getOwned(userId, id);
    const updated = await this.repository.update(userId, id, input);
    if (!updated) throw new NotFoundException('Wallet tidak ditemukan');
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
      initialBalance: wallet.initialBalance.toString(),
      balance: (wallet.initialBalance + delta).toString(),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }
}
