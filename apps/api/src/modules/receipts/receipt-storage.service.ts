import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import * as path from 'path';

const NAME_PATTERN = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

/** Penyimpanan berkas struk di disk (nama acak, bukan nama dari user). */
@Injectable()
export class ReceiptStorageService {
  readonly root: string;
  /** Folder berisi <lang>.traineddata.gz yang dibundel di image; bila diset, OCR tidak mengunduh apa pun. */
  readonly bundledLangDir: string | undefined;

  constructor(config: ConfigService) {
    const configured = config.get<string>('RECEIPT_STORAGE_DIR')?.trim();
    // Default: apps/api/storage/receipts (src/modules/receipts → apps/api).
    this.bundledLangDir = config.get<string>('TESSDATA_DIR')?.trim() || undefined;
    this.root = configured ? path.resolve(configured) : path.resolve(__dirname, '../../../storage/receipts');
  }

  /** Cache data bahasa Tesseract (diunduh sekali). */
  get tessdataDir(): string {
    return path.join(path.dirname(this.root), 'tessdata');
  }

  async save(buffer: Buffer, extension: 'jpg' | 'png' | 'webp'): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const name = `${randomUUID()}.${extension}`;
    await writeFile(path.join(this.root, name), buffer, { mode: 0o600 });
    return name;
  }

  /** Baca berkas; nama harus berpola yang kita buat (mencegah path traversal). */
  async read(name: string): Promise<Buffer | null> {
    if (!NAME_PATTERN.test(name)) return null;
    try {
      return await readFile(path.join(this.root, name));
    } catch {
      return null;
    }
  }

  async remove(name: string): Promise<void> {
    if (NAME_PATTERN.test(name)) await rm(path.join(this.root, name), { force: true });
  }
}
