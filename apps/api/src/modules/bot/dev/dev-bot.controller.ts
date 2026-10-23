import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../../common/types';
import { BotCore } from '../core/bot-core.service';

const SimulateSchema = z
  .object({
    /** Wajib berawalan "sim-" agar tidak bisa menyamar sebagai chat Telegram asli. */
    chatId: z.string().regex(/^sim-[A-Za-z0-9_-]{1,60}$/, 'chatId simulasi harus berawalan "sim-"').optional(),
    text: z.string().min(1).max(4000).optional(),
    callback: z.string().min(1).max(64).optional(),
    username: z.string().max(64).nullable().optional(),
    /** Simulasikan chat grup (harus ditolak bot). */
    group: z.boolean().optional(),
  })
  .refine((v) => (v.text === undefined) !== (v.callback === undefined), { message: 'Isi salah satu: text atau callback' });

type SimulateInput = z.infer<typeof SimulateSchema>;

/**
 * DEV-ONLY: memasukkan pesan/callback ke BotCore atas nama chat simulasi dan mengembalikan balasan.
 * Hanya terdaftar bila NODE_ENV=development (lihat BotModule), dan tetap diperiksa di sini.
 */
@Controller('dev/bot')
export class DevBotController {
  constructor(private core: BotCore) {}

  @Post('simulate')
  async simulate(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(SimulateSchema)) body: SimulateInput) {
    if (process.env.NODE_ENV !== 'development') throw new ForbiddenException('Hanya tersedia di mode development.');
    const chatId = body.chatId ?? `sim-${user.userId}`;
    const base = { channel: 'SIMULATOR' as const, chatId, isPrivate: !body.group, username: body.username ?? null };
    const replies = await this.core.handle(
      body.text !== undefined ? { ...base, kind: 'message', text: body.text } : { ...base, kind: 'callback', data: body.callback as string },
    );
    return { chatId, replies };
  }
}
