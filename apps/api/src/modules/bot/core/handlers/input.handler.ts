import { Injectable, Logger } from '@nestjs/common';
import {
  formatMoneyId,
  getTodayInJakarta,
  parseTransactionMessage,
  suggestCategoryId,
  toDateString,
  type ParseContext,
  type ParseResult,
} from 'shared';
import { AiQuotaError } from '../../../ai/ai.errors';
import { AiTransactionParser, type AiTransactionResult } from '../../../ai/ai-transaction.parser';
import { AiUsageService } from '../../../ai/ai-usage.service';
import { CategoriesService, CategoryResponse } from '../../../categories/categories.service';
import { MerchantRulesService } from '../../../merchant-rules/merchant-rules.service';
import { TransactionsService } from '../../../transactions/transactions.service';
import { WalletsService } from '../../../wallets/wallets.service';
import { BotPendingRepository } from '../../bot-pending.repository';
import { renderDraft, TYPE_LABEL } from '../format';
import { mergeAiGuess } from '../free-text.merge';
import { BotReply, BotUser, send, sendMessage } from '../types';
import { getErrorText } from '../util';

export const MAX_LINES_PER_MESSAGE = 10;
/** Batas panggilan LLM per pesan (menjaga biaya & latensi). */
export const MAX_AI_CALLS_PER_MESSAGE = 3;

const AI_FALLBACK_REASONS = new Set(['NO_AMOUNT', 'AMOUNT_TOO_SMALL', 'AMBIGUOUS_AMOUNT', 'TRANSFER_WALLETS']);
/** Baris tanpa angka maupun kata bilangan tidak layak dikirim ke LLM. */
const HAS_AMOUNT_HINT = /\d|\b(seribu|sejuta|ribu|juta|ratus|setengah)\b/i;

/**
 * Pesan teks biasa → satu atau lebih draft transaksi. Parser aturan dulu; LLM hanya sebagai
 * fallback (nominal/kategori tidak yakin). Hasil selalu DRAFT, tidak pernah auto-confirm.
 */
@Injectable()
export class InputHandler {
  private readonly logger = new Logger(InputHandler.name);

  constructor(
    private transactions: TransactionsService,
    private wallets: WalletsService,
    private categories: CategoriesService,
    private rules: MerchantRulesService,
    private pending: BotPendingRepository,
    private aiParser: AiTransactionParser,
    private aiUsage: AiUsageService,
  ) {}

  async handle(user: BotUser, text: string): Promise<BotReply[]> {
    const wallets = await this.wallets.list(user.userId, false);
    if (wallets.length === 0) {
      return [send('Kamu belum punya dompet. Buat dulu di web (menu Dompet), lalu coba lagi.')];
    }
    const [categories, rules] = await Promise.all([this.categories.list(user.userId), this.rules.list(user.userId)]);

    const today = toDateString(getTodayInJakarta());
    const ctx: ParseContext = { today, wallets: wallets.map((w) => ({ id: w.id, name: w.name })) };
    const allLines = parseTransactionMessage(text, ctx);
    if (allLines.length === 0) return [send('Kirim transaksi seperti: makan siang 35rb')];

    const lines = allLines.slice(0, MAX_LINES_PER_MESSAGE);
    const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? (wallets.length === 1 ? wallets[0].id : null);

    const replies: BotReply[] = [];
    const problems: string[] = [];
    let aiCalls = 0;
    let aiNotice: string | null = null;
    let aiDown = false;

    for (const { line, result } of lines) {
      const suggestion = result.ok ? suggestCategoryId(result.tx.normalized, result.tx.type, rules) : null;
      const ruleCategory = result.ok && suggestion ? this.usableCategory(categories, suggestion.categoryId, result.tx.type) : null;

      let ai: AiTransactionResult | null = null;
      if (this.needsAi(line, result, ruleCategory) && this.aiParser.available && aiCalls < MAX_AI_CALLS_PER_MESSAGE && !aiNotice) {
        aiCalls++;
        try {
          ai = await this.aiUsage.track(user.userId, 'PARSE', (meter) =>
            this.aiParser.parse(
              {
                text: line,
                today,
                categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
                wallets: wallets.map((w) => ({ id: w.id, name: w.name })),
              },
              meter,
            ),
          );
        } catch (error) {
          if (error instanceof AiQuotaError) aiNotice = error.message;
          else {
            aiDown = true;
            this.logger.warn(`Fallback AI gagal: ${getErrorText(error)}`);
          }
        }
      }

      const merged = mergeAiGuess(result, ai, { today, defaultWalletId });
      if (!merged.ok) {
        problems.push(`• "${line}" → ${merged.message}${aiDown && !result.ok ? ' (AI sedang tidak tersedia)' : ''}`);
        continue;
      }
      const d = merged.draft;
      const category = ruleCategory ?? (d.categoryId ? this.usableCategory(categories, d.categoryId, d.type) : null);

      try {
        if (!d.walletId) {
          const pendingId = await this.pending.create(user.userId, {
            type: d.type,
            amount: d.amount.toString(),
            date: d.date,
            categoryId: category?.id ?? null,
            description: d.merchant ?? '',
            aiConfidence: d.aiConfidence,
            note: d.note,
          });
          replies.push(this.walletQuestion(pendingId, wallets.map((w) => w.name), d.type, d.amount, d.merchant ?? ''));
          continue;
        }
        const draft = await this.transactions.createDraft(
          user.userId,
          {
            type: d.type,
            walletId: d.walletId,
            toWalletId: d.toWalletId,
            categoryId: category?.id ?? null,
            amount: d.amount,
            date: d.date,
            merchant: d.merchant,
            note: d.note,
            aiConfidence: d.aiConfidence,
          },
          'TELEGRAM',
        );
        replies.push(sendMessage(renderDraft(draft, today)));
      } catch (error) {
        this.logger.warn(`Gagal membuat draft: ${getErrorText(error)}`);
        problems.push(`• "${line}" → ${getErrorText(error)}`);
      }
    }

    if (allLines.length > lines.length) {
      problems.push(`• ${allLines.length - lines.length} baris terakhir diabaikan (maks. ${MAX_LINES_PER_MESSAGE} per pesan).`);
    }
    if (problems.length > 0) {
      replies.push(send(`⚠️ Tidak bisa diproses:\n${problems.join('\n')}`));
    }
    if (aiNotice) replies.push(send(`ℹ️ ${aiNotice}`));
    return replies;
  }

  /** LLM dipakai bila parser gagal menemukan nominal, atau nominal ada tetapi kategori tidak yakin. */
  private needsAi(line: string, result: ParseResult, category: CategoryResponse | null): boolean {
    if (result.ok) return result.tx.type !== 'TRANSFER' && category === null;
    return AI_FALLBACK_REASONS.has(result.reason) && HAS_AMOUNT_HINT.test(line);
  }

  private usableCategory(categories: CategoryResponse[], id: string, type: string): CategoryResponse | null {
    const found = categories.find((c) => c.id === id);
    return found && found.type === type ? found : null;
  }

  private walletQuestion(pendingId: string, walletNames: string[], type: string, amount: bigint, description: string): BotReply {
    const label = TYPE_LABEL[type as keyof typeof TYPE_LABEL];
    const rows = walletNames.map((name, idx) => [{ text: `👛 ${name}`, data: `p:${pendingId}:${idx}` }]);
    return send(`Pakai dompet mana?\n${label} ${formatMoneyId(amount)}${description ? ` · ${description}` : ''}`, rows);
  }
}
