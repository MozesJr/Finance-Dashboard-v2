import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { ReceiptStorageService } from './receipt-storage.service';

const MAX_PIXELS = 50_000_000;

/** Pra-proses gambar untuk OCR: rotasi EXIF, grayscale, perbesar ~2×, normalize, pertajam. */
export async function preprocessForOcr(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image, { limitInputPixels: MAX_PIXELS }).metadata();
  const width = meta.width ?? 1000;
  const targetWidth = Math.min(2400, Math.max(1000, width * 2));
  return sharp(image, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .grayscale()
    .resize({ width: targetWidth })
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

/** OCR Tesseract (ind+eng). Worker dibuat sekali dan dipakai ulang; panggilan diserialisasi. */
@Injectable()
export class TesseractOcrEngine implements OnModuleDestroy {
  private readonly logger = new Logger(TesseractOcrEngine.name);
  private worker: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private storage: ReceiptStorageService) {}

  async recognize(image: Buffer): Promise<string> {
    const prepared = await preprocessForOcr(image);
    const run = async () => {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(prepared);
      return data.text;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    try {
      return await result;
    } catch (error) {
      this.worker = null; // buat ulang pada percobaan berikutnya
      this.logger.error(`OCR gagal: ${error instanceof Error ? error.message : 'unknown'}`);
      throw new ServiceUnavailableException('Pembaca struk (OCR) belum tersedia. Coba lagi nanti atau catat manual.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.worker) return;
    try {
      await (await this.worker).terminate();
    } catch {
      // abaikan
    }
  }

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = createWorker(['ind', 'eng'], 1, {
        cachePath: this.storage.tessdataDir,
        ...(this.storage.bundledLangDir ? { langPath: this.storage.bundledLangDir } : {}),
        logger: () => undefined,
      });
    }
    return this.worker;
  }
}
