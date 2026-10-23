import { Injectable, Logger } from '@nestjs/common';
import { AiParseError, AiQuotaError, AiUnavailableError } from '../../../ai/ai.errors';
import { AiChatService } from '../../../ai-chat/ai-chat.service';
import { BotReply, BotUser, send } from '../types';

const MAX_REPLY_CHARS = 3800; // batas pesan Telegram 4096

/** Pertanyaan tentang data keuangan → chat AI (tool calling ke service domain). */
@Injectable()
export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  constructor(private chat: AiChatService) {}

  async handle(user: BotUser, question: string): Promise<BotReply[]> {
    try {
      const answer = await this.chat.ask(user.userId, question);
      const text = answer.reply.length > MAX_REPLY_CHARS ? `${answer.reply.slice(0, MAX_REPLY_CHARS)}…` : answer.reply;
      return [send(text)];
    } catch (error) {
      if (error instanceof AiQuotaError) return [send(`ℹ️ ${error.message}`)];
      if (error instanceof AiUnavailableError) return [send('Maaf, asisten AI sedang tidak tersedia. Coba lagi sebentar. Perintah lain (/saldo, /hariini, ...) tetap bisa dipakai.')];
      if (error instanceof AiParseError) return [send('Maaf, jawaban AI tidak bisa dipahami. Coba tanyakan dengan kalimat lain.')];
      this.logger.error(`Chat gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      return [send('Maaf, pertanyaanmu gagal diproses. Coba lagi.')];
    }
  }
}
