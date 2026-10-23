import { Injectable, Logger } from '@nestjs/common';
import type { TransactionResponse } from './transactions.service';

export type ConfirmedListener = (userId: string, tx: TransactionResponse) => Promise<void> | void;

/**
 * Pub/sub ringan untuk "transaksi menjadi CONFIRMED". Pendengar (mis. checklist gajian di bot) tidak boleh
 * menggagalkan penyimpanan: error ditelan dan dicatat.
 */
@Injectable()
export class TransactionEvents {
  private readonly logger = new Logger(TransactionEvents.name);
  private readonly listeners: ConfirmedListener[] = [];

  onConfirmed(listener: ConfirmedListener): void {
    this.listeners.push(listener);
  }

  async emitConfirmed(userId: string, tx: TransactionResponse): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(userId, tx);
      } catch (error) {
        this.logger.warn(`Pendengar transaksi gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
  }
}
