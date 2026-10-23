import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { getTodayInJakarta, matchWalletByText, normalizeText, sanitizeReceipt, suggestCategoryId, toDateString } from 'shared';
import type { ReceiptExtraction } from 'shared';
import { AiTransactionParser } from '../ai/ai-transaction.parser';
import { AiUsageService } from '../ai/ai-usage.service';
import type { UsageMeter } from '../ai/usage-meter';
import { CategoriesService } from '../categories/categories.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { WalletsService } from '../wallets/wallets.service';
import { ReceiptStorageService } from './receipt-storage.service';
import { RECEIPT_PARSER, ReceiptParser } from './receipt-parser';
import { ReceiptsRepository } from './receipts.repository';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const FORMATS = { jpeg: { mime: 'image/jpeg', ext: 'jpg' }, png: { mime: 'image/png', ext: 'png' }, webp: { mime: 'image/webp', ext: 'webp' } } as const;

export interface ReceiptParseResponse {
  receiptId: string;
  merchant: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** Rupiah (string BigInt). */
  total: string;
  items: ReceiptExtraction['items'];
  paymentMethod: string | null;
  notes: string[];
  suggestedCategoryId: string | null;
  suggestedWalletId: string | null;
  imageUrl: string;
}

interface StoredReceiptJson {
  source: 'ocr' | 'vision';
  merchant: string | null;
  date: string;
  total: string;
  items: ReceiptExtraction['items'];
  paymentMethod: string | null;
  notes: string[];
}

const formatRp = (n: number | bigint) => `Rp${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/** Baris item untuk pratinjau (maks. 5 + ringkasan sisanya). */
export function receiptItemLines(items: ReceiptExtraction['items'], max = 5): string[] {
  const lines = items.slice(0, max).map((i) => `• ${i.qty !== 1 ? `${i.qty}× ` : ''}${i.name} ${formatRp(i.price)}`);
  if (items.length > max) lines.push(`… +${items.length - max} item lain`);
  return lines;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private repository: ReceiptsRepository,
    private storage: ReceiptStorageService,
    private aiUsage: AiUsageService,
    @Inject(RECEIPT_PARSER) private parser: ReceiptParser,
    private categories: CategoriesService,
    private rules: MerchantRulesService,
    private wallets: WalletsService,
    private aiTransactions: AiTransactionParser,
  ) {}

  /** Unggah + baca struk. Hasil hanya usulan; user tetap menyimpan transaksinya sendiri. */
  async parseUpload(userId: string, buffer: Buffer): Promise<ReceiptParseResponse> {
    const info = await this.inspect(buffer);
    const today = toDateString(getTodayInJakarta());

    return this.aiUsage.track(userId, 'RECEIPT', async (meter) => {
      const fileName = await this.storage.save(buffer, info.ext);
      const receipt = await this.repository.create({ userId, filePath: fileName, mimeType: info.mime, sizeBytes: buffer.length });

      let ocrText: string | null = null;
      try {
        const parsed = await this.parser.parse(buffer, today, meter);
        ocrText = parsed.ocrText;
        const sanitized = sanitizeReceipt(parsed.extraction, today);
        if (!sanitized.ok) throw new BadRequestException(sanitized.message);
        const r = sanitized.receipt;

        const [suggestedCategoryId, suggestedWalletId] = await Promise.all([
          this.suggestCategory(userId, r.merchant, r.items, r.total, meter),
          this.suggestWallet(userId, r.paymentMethod),
        ]);

        const stored: StoredReceiptJson = {
          source: this.parser.kind,
          merchant: r.merchant,
          date: r.date,
          total: r.total.toString(),
          items: r.items,
          paymentMethod: r.paymentMethod,
          notes: r.notes,
        };
        await this.repository.markParsed(receipt.id, ocrText, stored as unknown as Prisma.InputJsonValue);

        return {
          receiptId: receipt.id,
          merchant: r.merchant,
          date: r.date,
          total: r.total.toString(),
          items: r.items,
          paymentMethod: r.paymentMethod,
          notes: r.notes,
          suggestedCategoryId,
          suggestedWalletId,
          imageUrl: `/api/receipts/${receipt.id}/image`,
        };
      } catch (error) {
        await this.repository.markFailed(receipt.id, ocrText).catch(() => undefined);
        throw error;
      }
    });
  }

  /** Berkas gambar; hanya pemilik (selain itu 404). */
  async getImage(userId: string, id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const receipt = await this.repository.findOwned(userId, id);
    const buffer = receipt ? await this.storage.read(receipt.filePath) : null;
    if (!receipt || !buffer) throw new NotFoundException('Struk tidak ditemukan');
    return { buffer, mimeType: receipt.mimeType };
  }

  /** Hasil baca struk (tanpa gambar) untuk pratinjau; null bila tidak ada / bukan milik user. */
  async getParsed(userId: string, id: string): Promise<(StoredReceiptJson & { receiptId: string }) | null> {
    const receipt = await this.repository.findOwned(userId, id);
    if (!receipt?.parsedJson) return null;
    return { receiptId: receipt.id, ...(receipt.parsedJson as unknown as StoredReceiptJson) };
  }

  // ------------------------------------------------------------------ internal

  private async inspect(buffer: Buffer): Promise<{ mime: string; ext: 'jpg' | 'png' | 'webp' }> {
    if (buffer.length === 0) throw new BadRequestException('File kosong.');
    if (buffer.length > MAX_RECEIPT_BYTES) throw new BadRequestException('Ukuran file maksimal 10 MB.');
    let format: string | undefined;
    try {
      format = (await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata()).format;
    } catch {
      throw new BadRequestException('File bukan gambar yang valid.');
    }
    const known = format && format in FORMATS ? FORMATS[format as keyof typeof FORMATS] : null;
    if (!known) throw new BadRequestException('Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.');
    return { mime: known.mime, ext: known.ext };
  }

  private async suggestCategory(
    userId: string,
    merchant: string | null,
    items: ReceiptExtraction['items'],
    total: bigint,
    meter: UsageMeter,
  ): Promise<string | null> {
    const [categories, rules] = await Promise.all([this.categories.list(userId, 'EXPENSE'), this.rules.list(userId)]);
    const text = normalizeText([merchant ?? '', ...items.map((i) => i.name)].join(' '));
    const byRule = suggestCategoryId(text, 'EXPENSE', rules);
    if (byRule && categories.some((c) => c.id === byRule.categoryId)) return byRule.categoryId;

    // Tidak yakin lewat aturan → tanya LLM (satu permintaan user, pemakaian digabung di meter).
    if (!this.aiTransactions.available || text === '') return null;
    try {
      const wallets = await this.wallets.list(userId, false);
      const guess = await this.aiTransactions.parse(
        {
          text: `${merchant ?? 'struk'}: ${items.slice(0, 8).map((i) => i.name).join(', ')} (total ${total})`,
          today: toDateString(getTodayInJakarta()),
          categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
          wallets: wallets.map((w) => ({ id: w.id, name: w.name })),
        },
        meter,
      );
      return guess.type === 'EXPENSE' ? guess.categoryId : null;
    } catch (error) {
      this.logger.warn(`Saran kategori struk gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  private async suggestWallet(userId: string, paymentMethod: string | null): Promise<string | null> {
    if (!paymentMethod) return null;
    const wallets = await this.wallets.list(userId, false);
    return matchWalletByText(paymentMethod, wallets.map((w) => ({ id: w.id, name: w.name })));
  }
}
