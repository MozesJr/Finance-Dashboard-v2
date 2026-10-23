import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Wallet } from '@prisma/client';
import { getTodayInJakarta, investmentMetrics } from 'shared';
import { WalletsRepository } from './wallets.repository';
import { CreateWalletInput, UpdateWalletInput, WalletValuationInput } from './dto/wallet.dto';

export interface WalletResponse {
  id: string;
  name: string;
  type: string;
  color: string | null;
  isArchived: boolean;
  isDefault: boolean;
  initialBalance: string;
  balance: string;
  /** Hanya untuk dompet INVESTMENT. */
  investment?: InvestmentResponse;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvestmentResponse {
  capital: string;
  unrealized: string;
  unrealizedPct: number | null;
  lastAdjustedAt: string | null;
}

export interface InvestmentSummary {
  wallets: Array<{ id: string; name: string; value: string; capital: string; unrealized: string; unrealizedPct: number | null; lastAdjustedAt: string | null }>;
  totalValue: string;
  totalCapital: string;
  totalUnrealized: string;
  totalUnrealizedPct: number | null;
}

export interface ValuationEntry {
  id: string;
  amount: string;
  date: string;
  createdAt: Date;
  note: string | null;
}

const ADJUSTMENT_NOTE = 'Penyesuaian nilai pasar';

@Injectable()
export class WalletsService {
  constructor(private repository: WalletsRepository) {}

  async list(userId: string, includeArchived = false): Promise<WalletResponse[]> {
    const [wallets, deltas] = await Promise.all([
      this.repository.findAll(userId, includeArchived),
      this.repository.getBalanceDeltas(userId),
    ]);
    const stats = wallets.some((w) => w.type === 'INVESTMENT') ? await this.repository.getInvestmentStats(userId) : null;
    return wallets.map((w) => this.toResponse(w, deltas.get(w.id) ?? 0n, stats));
  }

  async get(userId: string, id: string): Promise<WalletResponse> {
    const wallet = await this.getOwned(userId, id);
    const deltas = await this.repository.getBalanceDeltas(userId);
    const stats = wallet.type === 'INVESTMENT' ? await this.repository.getInvestmentStats(userId) : null;
    return this.toResponse(wallet, deltas.get(id) ?? 0n, stats);
  }

  /** Perbarui nilai pasar dompet INVESTMENT: membuat transaksi ADJUSTMENT sebesar selisih (atomik). */
  async setValuation(userId: string, id: string, input: WalletValuationInput): Promise<{ wallet: WalletResponse; adjustment: ValuationEntry | null }> {
    const wallet = await this.getOwned(userId, id);
    if (wallet.type !== 'INVESTMENT') throw new BadRequestException('Perbarui nilai hanya untuk dompet bertipe Investasi.');
    if (wallet.isArchived) throw new BadRequestException('Dompet sudah diarsipkan.');
    const date = input.date ? new Date(`${input.date}T00:00:00Z`) : getTodayInJakarta();
    const created = await this.repository.applyValuation(userId, id, input.value, date, ADJUSTMENT_NOTE);
    const updated = await this.get(userId, id);
    return {
      wallet: updated,
      adjustment: created
        ? { id: created.id, amount: created.amount.toString(), date: date.toISOString().slice(0, 10), createdAt: new Date(), note: ADJUSTMENT_NOTE }
        : null,
    };
  }

  async listValuations(userId: string, id: string, limit = 50): Promise<ValuationEntry[]> {
    await this.getOwned(userId, id);
    const rows = await this.repository.listAdjustments(userId, id, limit);
    return rows.map((r) => ({ id: r.id, amount: r.amount.toString(), date: r.date.toISOString().slice(0, 10), createdAt: r.createdAt, note: r.note }));
  }

  /** Ringkasan semua dompet INVESTMENT aktif (dipakai web, bot /investasi dan AI chat). */
  async investmentSummary(userId: string): Promise<InvestmentSummary> {
    const wallets = (await this.list(userId)).filter((w) => w.type === 'INVESTMENT' && w.investment);
    let totalValue = 0n;
    let totalCapital = 0n;
    const rows = wallets.map((w) => {
      const inv = w.investment as InvestmentResponse;
      totalValue += BigInt(w.balance);
      totalCapital += BigInt(inv.capital);
      return { id: w.id, name: w.name, value: w.balance, capital: inv.capital, unrealized: inv.unrealized, unrealizedPct: inv.unrealizedPct, lastAdjustedAt: inv.lastAdjustedAt };
    });
    const total = investmentMetrics(totalValue, totalCapital);
    return {
      wallets: rows,
      totalValue: totalValue.toString(),
      totalCapital: totalCapital.toString(),
      totalUnrealized: total.unrealized.toString(),
      totalUnrealizedPct: total.unrealizedPct,
    };
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

  private toResponse(
    wallet: Wallet,
    delta: bigint,
    stats: { capitalDeltas: Map<string, bigint>; lastAdjusted: Map<string, Date> } | null = null,
  ): WalletResponse {
    const balance = wallet.initialBalance + delta;
    let investment: InvestmentResponse | undefined;
    if (wallet.type === 'INVESTMENT' && stats) {
      const capital = wallet.initialBalance + (stats.capitalDeltas.get(wallet.id) ?? 0n);
      const m = investmentMetrics(balance, capital);
      investment = {
        capital: capital.toString(),
        unrealized: m.unrealized.toString(),
        unrealizedPct: m.unrealizedPct,
        lastAdjustedAt: stats.lastAdjusted.get(wallet.id)?.toISOString() ?? null,
      };
    }
    return {
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
      color: wallet.color,
      isArchived: wallet.isArchived,
      isDefault: wallet.isDefault,
      initialBalance: wallet.initialBalance.toString(),
      balance: balance.toString(),
      ...(investment ? { investment } : {}),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }
}
