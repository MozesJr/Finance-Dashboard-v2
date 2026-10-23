import { Injectable } from '@nestjs/common';

export const LINK_MAX_FAILURES = 5;
/** Lama kunci sejak kegagalan ke-5; juga jendela penghitungan kegagalan. */
export const LINK_LOCK_MS = 15 * 60 * 1000;

interface Entry {
  channel: string;
  chatId: string;
  username: string | null;
  failures: number[];
  lockedUntil: number | null;
}

export interface LockedChat {
  channel: string;
  chatId: string;
  username: string | null;
  lockedUntil: Date;
  remainingSeconds: number;
}

/**
 * Penguncian percobaan /link yang salah: 5 kegagalan dalam 15 menit → chat dikunci 15 menit.
 * Disimpan di memori proses ini (hilang saat restart, tidak dibagi antar-instance).
 * Admin dapat membuka kunci lewat /admin/telegram/lockouts.
 */
@Injectable()
export class LinkLockout {
  private entries = new Map<string, Entry>();

  static key(channel: string, chatId: string): string {
    return `${channel}:${chatId}`;
  }

  /** Sisa waktu kunci (ms); 0 bila tidak terkunci. */
  remainingMs(key: string): number {
    const entry = this.entries.get(key);
    if (!entry?.lockedUntil) return 0;
    const remaining = entry.lockedUntil - Date.now();
    if (remaining <= 0) {
      this.entries.delete(key);
      return 0;
    }
    return remaining;
  }

  /** Catat satu kode salah. Mengembalikan true bila chat kini terkunci. */
  recordFailure(channel: string, chatId: string, username: string | null): boolean {
    const key = LinkLockout.key(channel, chatId);
    const now = Date.now();
    const entry = this.entries.get(key) ?? { channel, chatId, username, failures: [], lockedUntil: null };
    entry.username = username ?? entry.username;
    entry.failures = entry.failures.filter((t) => now - t < LINK_LOCK_MS);
    entry.failures.push(now);
    if (entry.failures.length >= LINK_MAX_FAILURES) {
      entry.lockedUntil = now + LINK_LOCK_MS;
      entry.failures = [];
    }
    this.entries.set(key, entry);
    return entry.lockedUntil !== null;
  }

  /** Hapus riwayat kegagalan (dipanggil saat /link berhasil). */
  clear(key: string): void {
    this.entries.delete(key);
  }

  /** Buka kunci semua chat dengan chatId ini. Mengembalikan jumlah entri yang dibuka. */
  unlockChat(chatId: string): number {
    let count = 0;
    for (const [key, entry] of this.entries) {
      if (entry.chatId === chatId && entry.lockedUntil !== null) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  listLocked(): LockedChat[] {
    const now = Date.now();
    const out: LockedChat[] = [];
    for (const [key, entry] of this.entries) {
      if (!entry.lockedUntil) continue;
      if (entry.lockedUntil <= now) {
        this.entries.delete(key);
        continue;
      }
      out.push({
        channel: entry.channel,
        chatId: entry.chatId,
        username: entry.username,
        lockedUntil: new Date(entry.lockedUntil),
        remainingSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
      });
    }
    return out;
  }
}
