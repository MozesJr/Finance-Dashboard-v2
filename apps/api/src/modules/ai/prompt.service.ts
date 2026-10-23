import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import * as path from 'path';

/** Memuat prompts/*.md saat start. Tidak ada prompt inline di kode. */
@Injectable()
export class PromptService implements OnModuleInit {
  private readonly logger = new Logger(PromptService.name);
  private prompts = new Map<string, string>();

  onModuleInit(): void {
    this.load(path.join(__dirname, 'prompts'));
  }

  load(dir: string): void {
    this.prompts.clear();
    let files: string[] = [];
    try {
      files = readdirSync(dir);
    } catch {
      this.logger.warn(`Direktori prompt tidak ditemukan: ${dir}`);
    }
    for (const file of files) {
      if (file.endsWith('.md')) this.prompts.set(file.slice(0, -3), readFileSync(path.join(dir, file), 'utf8').trim());
    }
    this.logger.log(`${this.prompts.size} prompt dimuat.`);
  }

  /** Ambil prompt; {{nama}} diganti dari vars. */
  get(name: string, vars: Record<string, string> = {}): string {
    const text = this.prompts.get(name);
    if (text === undefined) throw new Error(`Prompt "${name}" tidak ditemukan.`);
    return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }
}
