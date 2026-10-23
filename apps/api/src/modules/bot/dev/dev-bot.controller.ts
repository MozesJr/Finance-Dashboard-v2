import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../../common/types';
import { BotCore } from '../core/bot-core.service';
import { DevOutbox } from '../bot-notifier';
import { BillRemindersJob } from '../jobs/bill-reminders.job';
import { TelegramLinkService } from '../../telegram-link/telegram-link.service';

const SimulateSchema = z
  .object({
    /** Wajib berawalan "sim-" agar tidak bisa menyamar sebagai chat Telegram asli. */
    chatId: z.string().regex(/^sim-[A-Za-z0-9_-]{1,60}$/, 'chatId simulasi harus berawalan "sim-"').optional(),
    text: z.string().min(1).max(4000).optional(),
    callback: z.string().min(1).max(64).optional(),
    /** Foto struk (base64) untuk uji e2e tanpa Telegram. */
    photoBase64: z.string().min(1).optional(),
    username: z.string().max(64).nullable().optional(),
    /** Simulasikan chat grup (harus ditolak bot). */
    group: z.boolean().optional(),
  })
  .refine((v) => [v.text, v.callback, v.photoBase64].filter((x) => x !== undefined).length === 1, {
    message: 'Isi tepat satu: text, callback, atau photoBase64',
  });

type SimulateInput = z.infer<typeof SimulateSchema>;

/**
 * DEV-ONLY: memasukkan pesan/callback ke BotCore atas nama chat simulasi dan mengembalikan balasan.
 * Hanya terdaftar bila NODE_ENV=development (lihat BotModule), dan tetap diperiksa di sini.
 */
@Controller('dev/bot')
export class DevBotController {
  constructor(
    private core: BotCore,
    private outbox: DevOutbox,
    private links: TelegramLinkService,
    private billReminders: BillRemindersJob,
  ) {}

  /** DEV-ONLY: jalankan job pengingat tagihan untuk tanggal tertentu (default hari ini) tanpa menunggu cron 08:00. */
  @Post('run-bill-reminders')
  async runBillReminders(@Body() body: { date?: string } = {}) {
    if (process.env.NODE_ENV !== 'development') throw new ForbiddenException('Hanya tersedia di mode development.');
    const date = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? new Date(`${body.date}T00:00:00Z`) : undefined;
    return this.billReminders.run(date);
  }

  /** Pesan yang didorong server ke chat simulasi user ini (checklist gajian, pengingat); sekali baca. */
  @Get('outbox')
  async drain(@CurrentUser() user: CurrentUserData) {
    if (process.env.NODE_ENV !== 'development') throw new ForbiddenException('Hanya tersedia di mode development.');
    const chatId = await this.links.getChatId(user.userId);
    return { chatId, messages: chatId ? this.outbox.drain(chatId) : [] };
  }

  @Post('simulate')
  async simulate(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(SimulateSchema)) body: SimulateInput) {
    if (process.env.NODE_ENV !== 'development') throw new ForbiddenException('Hanya tersedia di mode development.');
    const chatId = body.chatId ?? `sim-${user.userId}`;
    const base = { channel: 'SIMULATOR' as const, chatId, isPrivate: !body.group, username: body.username ?? null };
    const input =
      body.photoBase64 !== undefined
        ? ({ ...base, kind: 'photo', image: Buffer.from(body.photoBase64, 'base64') } as const)
        : body.text !== undefined
          ? ({ ...base, kind: 'message', text: body.text } as const)
          : ({ ...base, kind: 'callback', data: body.callback as string } as const);
    const replies = await this.core.handle(input);
    return { chatId, replies };
  }
}
