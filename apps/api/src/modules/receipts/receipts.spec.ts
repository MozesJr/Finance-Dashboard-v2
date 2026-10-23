import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { AiUnavailableError } from '../ai/ai.errors';
import { UsageMeter } from '../ai/usage-meter';
import { OcrReceiptParser } from './ocr-receipt.parser';
import { ReceiptStorageService } from './receipt-storage.service';
import { ReceiptsService } from './receipts.service';
import { preprocessForOcr } from './tesseract-ocr.engine';

const png = () => sharp({ create: { width: 40, height: 60, channels: 3, background: '#ffffff' } }).png().toBuffer();
const jpeg = () => sharp({ create: { width: 40, height: 60, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
const webp = () => sharp({ create: { width: 40, height: 60, channels: 3, background: '#ffffff' } }).webp().toBuffer();
const gif = () => sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).gif().toBuffer();

const extraction = (over: Record<string, unknown> = {}) => ({
  merchant: 'Warung Makan Sederhana',
  date: '2019-05-10',
  total: 43_500,
  items: [
    { name: 'Nasi Goreng', qty: 1, price: 30_000 },
    { name: 'Es Teh', qty: 1, price: 13_500 },
  ],
  paymentMethod: 'Debit BCA',
  ...over,
});

describe('ReceiptStorageService', () => {
  const make = () => new ReceiptStorageService({ get: (k: string) => (k === 'RECEIPT_STORAGE_DIR' ? mkdtempSync(path.join(tmpdir(), 'receipts-')) : undefined) } as unknown as ConfigService);

  it('menyimpan dengan nama acak (bukan dari user), membaca kembali, dan menghapus', async () => {
    const storage = make();
    const a = await storage.save(Buffer.from('abc'), 'png');
    const b = await storage.save(Buffer.from('abc'), 'png');
    expect(a).toMatch(/^[a-f0-9-]{36}\.png$/);
    expect(a).not.toBe(b);
    expect((await storage.read(a))?.toString()).toBe('abc');
    await storage.remove(a);
    expect(await storage.read(a)).toBeNull();
  });

  it('read menolak nama di luar pola (path traversal)', async () => {
    const storage = make();
    for (const name of ['../../etc/passwd', '..%2F..%2Fsecret.png', 'foo.png', '/abs/path.jpg', '']) {
      expect(await storage.read(name)).toBeNull();
    }
  });

  it('direktori default berada di apps/api/storage/receipts dan tessdata di sebelahnya', () => {
    const storage = new ReceiptStorageService({ get: () => undefined } as unknown as ConfigService);
    expect(storage.root.endsWith(path.join('apps', 'api', 'storage', 'receipts'))).toBe(true);
    expect(storage.tessdataDir.endsWith(path.join('apps', 'api', 'storage', 'tessdata'))).toBe(true);
  });
});

describe('preprocessForOcr', () => {
  it('menghasilkan PNG grayscale yang diperbesar (min lebar 1000)', async () => {
    const out = await preprocessForOcr(await jpeg());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBeGreaterThanOrEqual(1000);
  });
});

describe('OcrReceiptParser', () => {
  it('teks OCR dikirim ke LLM dengan prompt struk dan skema Zod; hasil dikembalikan beserta teks OCR', async () => {
    const ocr = { recognize: jest.fn().mockResolvedValue('BreadTalk\n1 Bread 11,500\nTotal: 43,500\nDebit BCA') };
    const llm = { structured: jest.fn().mockResolvedValue(extraction()) };
    const prompts = { get: jest.fn().mockReturnValue('PROMPT STRUK') };
    const parser = new OcrReceiptParser(ocr as never, llm as never, prompts as never);
    const meter = new UsageMeter();

    const res = await parser.parse(Buffer.from('x'), '2026-10-23', meter);

    expect(res.ocrText).toContain('Total: 43,500');
    expect(res.extraction.total).toBe(43_500);
    expect(prompts.get).toHaveBeenCalledWith('parse-receipt');
    const call = llm.structured.mock.calls[0][0];
    expect(call.messages[0].content).toBe('PROMPT STRUK');
    expect(call.messages[1].content).toContain('Hari ini: 2026-10-23');
    expect(call.messages[1].content).toContain('Total: 43,500');
    expect(call.schema.name).toBe('receipt_extraction');
    expect(call.meter).toBe(meter);
  });

  it('OCR hampir kosong → BadRequest ramah, LLM tidak dipanggil', async () => {
    const ocr = { recognize: jest.fn().mockResolvedValue('  ~ . ') };
    const llm = { structured: jest.fn() };
    const parser = new OcrReceiptParser(ocr as never, llm as never, { get: jest.fn() } as never);
    await expect(parser.parse(Buffer.from('x'), '2026-10-23')).rejects.toBeInstanceOf(BadRequestException);
    expect(llm.structured).not.toHaveBeenCalled();
  });

  it('teks OCR dipotong 6000 karakter', async () => {
    const ocr = { recognize: jest.fn().mockResolvedValue('A'.repeat(20_000)) };
    const llm = { structured: jest.fn().mockResolvedValue(extraction()) };
    await new OcrReceiptParser(ocr as never, llm as never, { get: jest.fn().mockReturnValue('P') } as never).parse(Buffer.from('x'), '2026-10-23');
    expect((llm.structured.mock.calls[0][0].messages[1].content as string).length).toBeLessThan(6100);
  });
});

describe('ReceiptsService', () => {
  const wallets = [
    { id: 'w-bca', name: 'BCA' },
    { id: 'w-tunai', name: 'Dompet Tunai' },
  ];
  const categories = [
    { id: 'cat-expense-makan', name: 'Makan & Minum', type: 'EXPENSE' },
    { id: 'cat-expense-belanja', name: 'Belanja', type: 'EXPENSE' },
  ];

  const build = () => {
    const repo = {
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      markParsed: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      findOwned: jest.fn(),
    };
    const storage = { save: jest.fn().mockResolvedValue('file.png'), read: jest.fn() };
    const aiUsage = { track: jest.fn(async (_u: string, _f: string, fn: (m: UsageMeter) => Promise<unknown>) => fn(new UsageMeter())) };
    const parser = { kind: 'ocr', parse: jest.fn().mockResolvedValue({ ocrText: 'teks ocr', extraction: extraction() }) };
    const categoriesSvc = { list: jest.fn().mockResolvedValue(categories) };
    const rules = { list: jest.fn().mockResolvedValue([]) };
    const walletsSvc = { list: jest.fn().mockResolvedValue(wallets) };
    const aiTx = { available: true, parse: jest.fn() };
    const service = new ReceiptsService(repo as never, storage as never, aiUsage as never, parser as never, categoriesSvc as never, rules as never, walletsSvc as never, aiTx as never);
    return { service, repo, storage, aiUsage, parser, rules, aiTx };
  };

  it('validasi berkas SEBELUM memakai kuota: kosong, > 10 MB, bukan gambar, format tak didukung', async () => {
    const t = build();
    await expect(t.service.parseUpload('u1', Buffer.alloc(0))).rejects.toThrow('File kosong');
    await expect(t.service.parseUpload('u1', Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toThrow('maksimal 10 MB');
    await expect(t.service.parseUpload('u1', Buffer.from('ini teks biasa, bukan gambar'))).rejects.toThrow('bukan gambar yang valid');
    await expect(t.service.parseUpload('u1', await gif())).rejects.toThrow('Format gambar tidak didukung');
    expect(t.aiUsage.track).not.toHaveBeenCalled();
    expect(t.storage.save).not.toHaveBeenCalled();
  });

  it.each([
    ['jpeg', jpeg, 'jpg', 'image/jpeg'],
    ['png', png, 'png', 'image/png'],
    ['webp', webp, 'webp', 'image/webp'],
  ] as const)('%s diterima: disimpan dengan ekstensi benar, Receipt dicatat, kuota fitur RECEIPT', async (_n, make, ext, mime) => {
    const t = build();
    const image = await make();
    const res = await t.service.parseUpload('u1', image);

    expect(t.aiUsage.track).toHaveBeenCalledWith('u1', 'RECEIPT', expect.any(Function));
    expect(t.storage.save).toHaveBeenCalledWith(image, ext);
    expect(t.repo.create).toHaveBeenCalledWith({ userId: 'u1', filePath: 'file.png', mimeType: mime, sizeBytes: image.length });
    expect(res).toMatchObject({ receiptId: 'r1', merchant: 'Warung Makan Sederhana', date: '2019-05-10', total: '43500', imageUrl: '/api/receipts/r1/image' });
    expect(t.repo.markParsed).toHaveBeenCalledWith('r1', 'teks ocr', expect.objectContaining({ total: '43500', source: 'ocr' }));
  });

  it('saran: kategori via kata kunci (tanpa LLM) & dompet dari metode pembayaran', async () => {
    const t = build();
    const res = await t.service.parseUpload('u1', await png());
    expect(res.suggestedCategoryId).toBe('cat-expense-makan');
    expect(res.suggestedWalletId).toBe('w-bca');
    expect(t.aiTx.parse).not.toHaveBeenCalled();
  });

  it('kategori tak dikenal oleh aturan → LLM (satu meter yang sama); gagal LLM tidak menggagalkan struk', async () => {
    const t = build();
    t.parser.parse.mockResolvedValue({ ocrText: 't', extraction: extraction({ merchant: 'PT Zxy', items: [{ name: 'Barang A', qty: 1, price: 43_500 }] }) });
    t.aiTx.parse.mockResolvedValue({ type: 'EXPENSE', categoryId: 'cat-expense-belanja' });
    const res = await t.service.parseUpload('u1', await png());
    expect(res.suggestedCategoryId).toBe('cat-expense-belanja');
    expect(t.aiTx.parse.mock.calls[0][1]).toBeInstanceOf(UsageMeter);

    t.aiTx.parse.mockRejectedValue(new AiUnavailableError());
    expect((await t.service.parseUpload('u1', await png())).suggestedCategoryId).toBeNull();
  });

  it('rule milik user dipakai untuk saran kategori', async () => {
    const t = build();
    t.parser.parse.mockResolvedValue({ ocrText: 't', extraction: extraction({ merchant: 'Zara', items: [] }) });
    t.rules.list.mockResolvedValue([{ pattern: 'zara', categoryId: 'cat-expense-belanja' }]);
    expect((await t.service.parseUpload('u1', await png())).suggestedCategoryId).toBe('cat-expense-belanja');
    expect(t.aiTx.parse).not.toHaveBeenCalled();
  });

  it('tanggal masa depan → hari ini + catatan; selisih item > 5% → catatan, total tetap', async () => {
    const t = build();
    t.parser.parse.mockResolvedValue({ ocrText: 't', extraction: extraction({ date: '2099-01-01', total: 90_000 }) });
    const res = await t.service.parseUpload('u1', await png());
    expect(res.date <= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(res.total).toBe('90000');
    expect(res.notes.join(' ')).toContain('masa depan');
    expect(res.notes.join(' ')).toContain('Jumlah item');
  });

  it('total 0 → ditandai FAILED dan BadRequest ramah (tidak ada saran)', async () => {
    const t = build();
    t.parser.parse.mockResolvedValue({ ocrText: 'teks', extraction: extraction({ total: 0 }) });
    await expect(t.service.parseUpload('u1', await png())).rejects.toThrow('Total pada struk tidak terbaca');
    expect(t.repo.markFailed).toHaveBeenCalledWith('r1', 'teks');
    expect(t.repo.markParsed).not.toHaveBeenCalled();
  });

  it('parser gagal (LLM down) → FAILED dan error diteruskan', async () => {
    const t = build();
    t.parser.parse.mockRejectedValue(new AiUnavailableError());
    await expect(t.service.parseUpload('u1', await png())).rejects.toBeInstanceOf(AiUnavailableError);
    expect(t.repo.markFailed).toHaveBeenCalledWith('r1', null);
  });

  it('gambar hanya untuk pemilik: milik user lain / berkas hilang → 404', async () => {
    const t = build();
    t.repo.findOwned.mockResolvedValue(null);
    await expect(t.service.getImage('u2', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    expect(t.repo.findOwned).toHaveBeenCalledWith('u2', 'r1');
    expect(t.storage.read).not.toHaveBeenCalled();

    t.repo.findOwned.mockResolvedValue({ filePath: 'file.png', mimeType: 'image/png' });
    t.storage.read.mockResolvedValue(null);
    await expect(t.service.getImage('u1', 'r1')).rejects.toBeInstanceOf(NotFoundException);

    t.storage.read.mockResolvedValue(Buffer.from('img'));
    expect(await t.service.getImage('u1', 'r1')).toEqual({ buffer: Buffer.from('img'), mimeType: 'image/png' });
  });

  it('getParsed: null bila bukan milik user / belum diparse', async () => {
    const t = build();
    t.repo.findOwned.mockResolvedValue(null);
    expect(await t.service.getParsed('u2', 'r1')).toBeNull();
    t.repo.findOwned.mockResolvedValue({ id: 'r1', parsedJson: null });
    expect(await t.service.getParsed('u1', 'r1')).toBeNull();
    t.repo.findOwned.mockResolvedValue({ id: 'r1', parsedJson: { items: [], notes: [] } });
    expect((await t.service.getParsed('u1', 'r1'))?.receiptId).toBe('r1');
  });
});
