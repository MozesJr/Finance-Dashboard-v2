import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import { TelegramBotInfo } from '../../../telegram-link/telegram-bot-info';
import { BOT_COMMANDS, BotCore } from '../../core/bot-core.service';
import { BotReply, ChannelAdapter, IncomingCallback, IncomingMessage, IncomingPhoto, OutgoingMessage } from '../../core/types';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type TelegramMode = 'polling' | 'webhook';

/**
 * Adapter Telegram (grammY): hanya menerjemahkan update ↔ BotCore.
 * Bot hanya start bila TELEGRAM_BOT_TOKEN ada.
 */
@Injectable()
export class TelegramBotService implements ChannelAdapter, OnModuleInit, OnModuleDestroy {
  readonly channel = 'TELEGRAM' as const;
  private readonly logger = new Logger('TelegramBot');
  private bot: Bot | null = null;
  private token: string | null = null;
  private mode: TelegramMode = 'polling';

  constructor(
    private config: ConfigService,
    private core: BotCore,
    private info: TelegramBotInfo,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  get webhookEnabled(): boolean {
    return this.bot !== null && this.mode === 'webhook';
  }

  async start(): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      this.logger.log('Bot Telegram dilewati: TELEGRAM_BOT_TOKEN tidak diisi.');
      return;
    }
    this.token = token;
    this.mode = this.config.get<string>('TELEGRAM_MODE') === 'webhook' ? 'webhook' : 'polling';

    if (this.mode === 'webhook' && !this.config.get<string>('TELEGRAM_WEBHOOK_SECRET')) {
      this.logger.error('Mode webhook membutuhkan TELEGRAM_WEBHOOK_SECRET. Bot Telegram tidak dijalankan.');
      return;
    }

    const bot = new Bot(token);
    this.bot = bot;
    this.registerHandlers(bot);
    this.info.enabled = true;

    try {
      await bot.init(); // getMe
      this.info.username = bot.botInfo.username;
      await bot.api.setMyCommands(BOT_COMMANDS);
    } catch (error) {
      this.logger.warn(`Inisialisasi Telegram sebagian gagal (app tetap jalan): ${this.safe(error)}`);
    }

    if (this.mode === 'webhook') {
      const url = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
      if (url) {
        try {
          await bot.api.setWebhook(url, { secret_token: this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') });
        } catch (error) {
          this.logger.warn(`setWebhook gagal: ${this.safe(error)}`);
        }
      }
      this.logger.log(`Bot Telegram aktif (webhook${this.info.username ? `, @${this.info.username}` : ''}).`);
      return;
    }

    // Polling: tidak di-await (resolve saat bot berhenti).
    void bot
      .start({ drop_pending_updates: false })
      .catch((error) => this.logger.error(`Polling Telegram berhenti: ${this.safe(error)}`));
    this.logger.log(`Bot Telegram aktif (polling${this.info.username ? `, @${this.info.username}` : ''}).`);
  }

  async stop(): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.stop();
    } catch {
      // abaikan: bot mungkin belum sempat start
    }
    this.bot = null;
    this.info.enabled = false;
  }

  /** Kirim pesan dari server (bukan balasan): checklist gajian, pengingat. false bila bot tidak aktif. */
  async push(chatId: string, message: OutgoingMessage): Promise<boolean> {
    if (!this.bot) return false;
    const markup = {
      reply_markup: { inline_keyboard: (message.buttons ?? []).map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) },
    };
    try {
      await this.bot.api.sendMessage(chatId, message.text, markup);
      return true;
    } catch (error) {
      this.logger.warn(`Kirim pesan ke chat gagal: ${this.safe(error)}`);
      return false;
    }
  }

  /** Dipanggil controller webhook. */
  async handleUpdate(update: unknown): Promise<void> {
    if (!this.bot) return;
    await this.bot.handleUpdate(update as Parameters<Bot['handleUpdate']>[0]);
  }

  // ---------------------------------------------------------------- terjemahan

  private registerHandlers(bot: Bot): void {
    bot.on('message:text', async (ctx) => {
      const input: IncomingMessage = {
        kind: 'message',
        channel: 'TELEGRAM',
        chatId: String(ctx.chat.id),
        isPrivate: ctx.chat.type === 'private',
        text: ctx.message.text,
        username: ctx.from?.username ?? null,
      };
      await this.deliver(ctx, await this.core.handle(input), false);
    });

    bot.on('message:photo', async (ctx) => {
      if (ctx.chat.type !== 'private') {
        await ctx.reply('Bot ini hanya melayani chat pribadi.');
        return;
      }
      const photo = ctx.message.photo[ctx.message.photo.length - 1]; // resolusi terbesar
      if ((photo.file_size ?? 0) > MAX_PHOTO_BYTES) {
        await ctx.reply('Ukuran foto maksimal 10 MB.');
        return;
      }
      const waiting = await ctx.reply('⏳ Membaca struk…');
      try {
        const image = await this.download(ctx, photo.file_id);
        const input: IncomingPhoto = {
          kind: 'photo',
          channel: 'TELEGRAM',
          chatId: String(ctx.chat.id),
          isPrivate: true,
          image,
          username: ctx.from?.username ?? null,
        };
        await this.deliver(ctx, await this.core.handle(input), false);
      } catch (error) {
        this.logger.warn(`Foto gagal diproses: ${this.safe(error)}`);
        await ctx.reply('Maaf, foto gagal diproses. Coba kirim lagi.');
      } finally {
        await ctx.api.deleteMessage(waiting.chat.id, waiting.message_id).catch(() => undefined);
      }
    });

    bot.on('callback_query:data', async (ctx) => {
      const chat = ctx.chat ?? ctx.callbackQuery.message?.chat;
      await ctx.answerCallbackQuery().catch(() => undefined);
      if (!chat) return;
      const input: IncomingCallback = {
        kind: 'callback',
        channel: 'TELEGRAM',
        chatId: String(chat.id),
        isPrivate: chat.type === 'private',
        data: ctx.callbackQuery.data,
        username: ctx.from?.username ?? null,
      };
      await this.deliver(ctx, await this.core.handle(input), true);
    });

    bot.catch((err) => this.logger.error(`Error handler Telegram: ${this.safe(err.error)}`));
  }

  /** Unduh berkas Telegram (URL memuat token: tidak pernah di-log). */
  private async download(ctx: Context, fileId: string): Promise<Buffer> {
    const file = await ctx.api.getFile(fileId);
    if (!file.file_path || !this.token) throw new Error('berkas tidak tersedia');
    const response = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
    if (!response.ok) throw new Error(`unduh gagal (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  private async deliver(ctx: Context, replies: BotReply[], fromCallback: boolean): Promise<void> {
    for (const reply of replies) {
      const markup = {
        reply_markup: { inline_keyboard: (reply.message.buttons ?? []).map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) },
      };
      try {
        if (reply.mode === 'edit' && fromCallback) {
          await ctx.editMessageText(reply.message.text, markup);
        } else {
          await ctx.reply(reply.message.text, markup);
        }
      } catch (error) {
        // Menekan tombol yang sama dua kali menghasilkan "message is not modified": aman diabaikan.
        if (!/message is not modified/i.test(this.safe(error))) throw error;
      }
    }
  }

  /** Pesan error tanpa token. */
  private safe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return this.token ? message.split(this.token).join('***') : message;
  }
}
