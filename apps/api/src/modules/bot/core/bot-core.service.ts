import { Injectable, Logger } from '@nestjs/common';
import { TelegramLinkService } from '../../telegram-link/telegram-link.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { BotPendingRepository } from '../bot-pending.repository';
import { DraftCallbackHandler, UNDO_WINDOW_MS } from './handlers/draft-callback.handler';
import { InputHandler } from './handlers/input.handler';
import { ReportsHandler } from './handlers/reports.handler';
import { summarizeTx } from './format';
import { SlidingWindowLimiter } from './rate-limiter';
import { HELP_TEXT, NOT_LINKED, START_UNLINKED, STATUS_BLOCKED } from './texts';
import { BotInput, BotReply, BotUser, edit, IncomingMessage, send } from './types';

export const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: 'saldo', description: 'Saldo semua dompet' },
  { command: 'hariini', description: 'Ringkasan hari ini' },
  { command: 'bulanini', description: 'Ringkasan bulan ini' },
  { command: 'alokasi', description: 'Status alokasi gaji bulan ini' },
  { command: 'tabungan', description: 'Progress goal tabungan' },
  { command: 'undo', description: 'Batalkan transaksi terakhir dari bot' },
  { command: 'batal', description: 'Buang draft yang belum disimpan' },
  { command: 'link', description: 'Hubungkan akun: /link <kode>' },
  { command: 'unlink', description: 'Putuskan akun dari chat ini' },
  { command: 'help', description: 'Bantuan' },
];

const RATE_LIMIT_PER_MINUTE = 20;
const LINK_FAIL_LIMIT = 5;
const LINK_FAIL_WINDOW_MS = 10 * 60 * 1000;

/** Otak bot yang tidak bergantung pada channel. Handler hanya memanggil service domain. */
@Injectable()
export class BotCore {
  private readonly logger = new Logger(BotCore.name);
  private readonly limiter = new SlidingWindowLimiter(RATE_LIMIT_PER_MINUTE, 60_000);
  private readonly linkFailures = new SlidingWindowLimiter(LINK_FAIL_LIMIT, LINK_FAIL_WINDOW_MS);

  constructor(
    private links: TelegramLinkService,
    private inputHandler: InputHandler,
    private callbacks: DraftCallbackHandler,
    private reports: ReportsHandler,
    private transactions: TransactionsService,
    private pending: BotPendingRepository,
  ) {}

  async handle(input: BotInput): Promise<BotReply[]> {
    if (!input.isPrivate) {
      return input.kind === 'message' ? [send('Bot ini hanya melayani chat pribadi.')] : [];
    }
    const key = `${input.channel}:${input.chatId}`;
    if (!this.limiter.allow(key)) {
      return [input.kind === 'callback' ? edit('⏳ Terlalu banyak aksi. Coba lagi sebentar.') : send('⏳ Terlalu banyak pesan. Coba lagi sebentar.')];
    }

    try {
      if (input.kind === 'message') return await this.handleMessage(input, key);
      return await this.handleCallback(input);
    } catch (error) {
      this.logger.error(`Gagal memproses input bot: ${error instanceof Error ? error.message : 'unknown'}`);
      return [input.kind === 'callback' ? edit('Maaf, terjadi kesalahan. Coba lagi.') : send('Maaf, terjadi kesalahan. Coba lagi.')];
    }
  }

  // ---------------------------------------------------------------- pesan

  private async handleMessage(input: IncomingMessage, key: string): Promise<BotReply[]> {
    const text = input.text.trim();
    if (text === '') return [];

    if (text.startsWith('/')) {
      const [head, ...rest] = text.split(/\s+/);
      const command = head.slice(1).split('@')[0].toLowerCase();
      const args = rest.join(' ');

      if (command === 'help') return [send(HELP_TEXT)];
      if (command === 'link') return this.link(input, key, args);

      const gate = await this.authenticate(input);
      if (!('userId' in gate)) {
        return command === 'start' ? [send(START_UNLINKED)] : gate;
      }
      return this.command(gate, input, command);
    }

    const gate = await this.authenticate(input);
    if (!('userId' in gate)) return gate;
    return this.inputHandler.handle(gate, text);
  }

  private async command(user: BotUser, input: IncomingMessage, command: string): Promise<BotReply[]> {
    switch (command) {
      case 'start':
        return [send(`👋 Akunmu sudah terhubung.\n\n${HELP_TEXT}`)];
      case 'saldo':
        return this.reports.saldo(user);
      case 'hariini':
        return this.reports.hariIni(user);
      case 'bulanini':
        return this.reports.bulanIni(user);
      case 'alokasi':
        return this.reports.alokasi(user);
      case 'tabungan':
        return this.reports.tabungan(user);
      case 'undo':
        return this.undo(user);
      case 'batal':
        return this.discardDrafts(user);
      case 'unlink':
        await this.links.unlinkChat(input.chatId);
        return [send('🔌 Chat ini sudah diputuskan dari akunmu. Kirim /link <kode> untuk menghubungkan lagi.')];
      default:
        return [send('Perintah tidak dikenal. Ketik /help untuk daftar perintah.')];
    }
  }

  private async link(input: IncomingMessage, key: string, args: string): Promise<BotReply[]> {
    if (!this.linkFailures.canProceed(key)) {
      return [send('Terlalu banyak percobaan kode yang salah. Coba lagi dalam beberapa menit.')];
    }
    if (args.trim() === '') return [send('Kirim kode dari web: /link 123456')];

    const result = await this.links.linkByCode(args, input.chatId, input.username ?? null);
    if (result.ok) {
      return [send('✅ Akun terhubung! Coba kirim: makan siang 35rb\n\nKetik /help untuk bantuan.')];
    }
    if (result.reason === 'INVALID') {
      this.linkFailures.record(key);
      return [send('Kode tidak valid atau sudah kedaluwarsa. Buat kode baru di web (Pengaturan → Telegram).')];
    }
    if (result.reason === 'CHAT_TAKEN') {
      return [send('Chat ini sudah terhubung ke sebuah akun. Kirim /unlink dulu bila ingin mengganti.')];
    }
    return [send('Akun itu sudah terhubung ke chat Telegram lain. Putuskan dulu dari web atau chat tersebut.')];
  }

  /** Resolusi user dari chat. Mengembalikan BotUser, atau balasan penolakan. */
  private async authenticate(input: { chatId: string; channel: BotInput['channel'] }): Promise<BotUser | BotReply[]> {
    const resolved = await this.links.resolveChat(input.chatId);
    if (!resolved) return [send(NOT_LINKED)];
    if (resolved.status !== 'ACTIVE') return [send(STATUS_BLOCKED[resolved.status] ?? 'Akunmu belum bisa dipakai.')];
    return { userId: resolved.userId, chatId: input.chatId, channel: input.channel };
  }

  private async undo(user: BotUser): Promise<BotReply[]> {
    const last = await this.transactions.findLastConfirmedFrom(user.userId, 'TELEGRAM', UNDO_WINDOW_MS);
    if (!last) return [send('Tidak ada transaksi dari Telegram dalam 24 jam terakhir.')];
    return [
      send(`Batalkan transaksi ini?\n${summarizeTx(last)}`, [
        [
          { text: '↩ Ya, batalkan', data: `uy:${last.id}` },
          { text: 'Tidak', data: 'un:-' },
        ],
      ]),
    ];
  }

  private async discardDrafts(user: BotUser): Promise<BotReply[]> {
    const [drafts, pending] = await Promise.all([
      this.transactions.discardDrafts(user.userId, 'TELEGRAM'),
      this.pending.deleteAllForUser(user.userId),
    ]);
    const total = drafts + pending;
    return [send(total === 0 ? 'Tidak ada draft aktif.' : `🗑 ${total} draft dibuang.`)];
  }

  // ---------------------------------------------------------------- callback

  private async handleCallback(input: Extract<BotInput, { kind: 'callback' }>): Promise<BotReply[]> {
    const gate = await this.authenticate(input);
    if (!('userId' in gate)) return gate.map((r) => ({ ...r, mode: 'edit' as const }));
    return this.callbacks.handle(gate, input.data);
  }
}
