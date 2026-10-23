import { Injectable, Logger } from '@nestjs/common';
import { extractRupiahAmounts, getCurrentMonthJakarta, getTodayInJakarta, toDateString, validateNarrativeNumbers } from 'shared';
import { AiUsageService } from '../ai/ai-usage.service';
import { LlmClient, LlmMessage } from '../ai/llm-client.service';
import { PromptService } from '../ai/prompt.service';
import { AiChatRepository } from './ai-chat.repository';
import { CHAT_TOOLS, ChatToolsService } from './chat-tools.service';

export const MAX_TOOL_ITERATIONS = 4;
export const HISTORY_LIMIT = 50;
export const STORED_MESSAGES_LIMIT = 200;
const HISTORY_CHARS = 500;
const MAX_TOOL_CALLS_PER_TURN = 4;
const UNGROUNDED_REPLY = 'Maaf, aku belum bisa memastikan angkanya dari datamu. Coba tanyakan lebih spesifik, mis. "berapa saldo semua dompetku?" atau "berapa pengeluaranku bulan ini?"';
const FALLBACK_REPLY = 'Maaf, aku belum bisa menjawab itu. Coba tanyakan dengan cara lain, mis. "berapa pengeluaranku bulan ini?"';

export interface ChatAnswer {
  reply: string;
  toolsUsed: string[];
}

/** Hilangkan sisa markdown agar tampil rapi di chat biasa. */
export function toPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*\*\s+/gm, '- ')
    .trim();
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private llm: LlmClient,
    private prompts: PromptService,
    private usage: AiUsageService,
    private tools: ChatToolsService,
    private repository: AiChatRepository,
  ) {}

  /** Satu pertanyaan = satu permintaan AI (kuota CHAT). Tool dipanggil server dengan userId dari JWT/chat tertaut. */
  ask(userId: string, message: string): Promise<ChatAnswer> {
    return this.usage.track(userId, 'CHAT', async (meter) => {
      const history = await this.repository.recent(userId, HISTORY_LIMIT);
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: this.prompts.get('chat-system', { today: toDateString(getTodayInJakarta()), month: getCurrentMonthJakarta() }),
        },
        ...history.map((h): LlmMessage => ({ role: h.role === 'USER' ? 'user' : 'assistant', content: truncate(h.content, HISTORY_CHARS) })),
        { role: 'user', content: message },
      ];

      const toolsUsed: string[] = [];
      const toolResults: string[] = [];
      let final: string | undefined;
      let forceTools = false;
      let correctedOnce = false;

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const response = await this.llm.chat({
          messages,
          tools: CHAT_TOOLS,
          toolChoice: forceTools ? 'required' : 'auto',
          temperature: 0.3,
          maxTokens: 800,
          meter,
        });
        forceTools = false;

        if (response.toolCalls.length === 0) {
          // Jawaban tanpa dasar data: angka Rupiah harus berasal dari hasil tool giliran ini.
          const ungrounded = this.ungroundedAmounts(response.content, toolResults);
          if (ungrounded.length > 0 && !correctedOnce && i < MAX_TOOL_ITERATIONS - 1) {
            correctedOnce = true;
            forceTools = true;
            this.logger.warn(`Jawaban chat memuat angka tanpa data tool (${ungrounded.length}); diminta memakai tool.`);
            messages.push(
              { role: 'assistant', content: response.content },
              { role: 'user', content: `Jawabanmu menyebut angka yang tidak ada di data (${ungrounded.join(', ')}). Panggil tool yang sesuai untuk mengambil datanya, lalu jawab hanya dengan angka dari hasil tool. Jangan menyebut koreksi ini kepada pengguna.` },
            );
            continue;
          }
          final = ungrounded.length > 0 ? UNGROUNDED_REPLY : response.content;
          break;
        }

        const calls = response.toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
        messages.push({ role: 'assistant', content: response.content || null, toolCalls: calls });
        const results = await Promise.all(calls.map((c) => this.tools.execute(userId, c.name, c.arguments)));
        calls.forEach((call, idx) => {
          toolsUsed.push(call.name);
          toolResults.push(results[idx]);
          messages.push({ role: 'tool', toolCallId: call.id, content: results[idx] });
        });
      }

      if (final === undefined) {
        // Batas iterasi tercapai: minta jawaban akhir dari data yang sudah ada (tanpa tools).
        messages.push({ role: 'user', content: 'Jawab sekarang berdasarkan data yang sudah kamu peroleh. Jangan memanggil tool lagi.' });
        const last = (await this.llm.chat({ messages, temperature: 0.3, maxTokens: 800, meter })).content;
        final = this.ungroundedAmounts(last, toolResults).length > 0 ? UNGROUNDED_REPLY : last;
      }

      const reply = toPlainText(final) || FALLBACK_REPLY;
      await this.persist(userId, message, reply);
      return { reply, toolsUsed };
    });
  }

  /** Nominal Rupiah di jawaban yang tidak ada di hasil tool giliran ini (dengan toleransi pembulatan). */
  private ungroundedAmounts(reply: string, toolResults: string[]): string[] {
    if (extractRupiahAmounts(reply).length === 0) return [];
    const allowed = toolResults.flatMap((r) => extractRupiahAmounts(r).map((m) => m.value));
    return validateNarrativeNumbers([reply], allowed).unknown;
  }

  history(userId: string) {
    return this.repository.recent(userId, HISTORY_LIMIT).then((rows) =>
      rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt })),
    );
  }

  async clearHistory(userId: string): Promise<void> {
    await this.repository.clear(userId);
  }

  private async persist(userId: string, userText: string, reply: string): Promise<void> {
    try {
      await this.repository.addExchange(userId, userText, reply);
      await this.repository.prune(userId, STORED_MESSAGES_LIMIT);
    } catch (error) {
      this.logger.warn(`Gagal menyimpan riwayat chat: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
