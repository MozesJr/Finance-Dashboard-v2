import { ConfigService } from '@nestjs/config';
import { AiParseError } from './ai.errors';
import { AiTransactionParser, type AiParseInput } from './ai-transaction.parser';
import { LlmClient } from './llm-client.service';
import { PromptService } from './prompt.service';
import { UsageMeter } from './usage-meter';

class FakeLlm extends LlmClient {
  complete = jest.fn();
}

const prompts = { get: jest.fn().mockReturnValue('PROMPT') } as unknown as PromptService;
const config = { get: (k: string) => ({ LLM_API_KEY: 'k', LLM_BASE_URL: 'http://x', LLM_MODEL: 'm' })[k] } as unknown as ConfigService;
const reply = (obj: unknown) => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
const out = (over: Record<string, unknown> = {}) => ({ type: 'EXPENSE', amount: 18000, categoryId: 'c1', walletId: 'w2', toWalletId: null, date: null, merchant: 'mie ayam', note: null, confidence: 0.9, ...over });

const input: AiParseInput = {
  text: 'tuku mie ayam 18rb pake gopay',
  today: '2026-10-23',
  categories: [
    { id: 'cat-expense-makan', name: 'Makan & Minum', type: 'EXPENSE' },
    { id: 'cat-income-gaji', name: 'Gaji', type: 'INCOME' },
  ],
  wallets: [
    { id: 'uuid-bca', name: 'BCA' },
    { id: 'uuid-gopay', name: 'GoPay' },
  ],
};

describe('AiTransactionParser', () => {
  let llm: FakeLlm;
  let parser: AiTransactionParser;

  beforeEach(() => {
    llm = new FakeLlm(config);
    parser = new AiTransactionParser(llm, prompts);
  });

  it('memetakan kode alias (c1/w2) kembali ke ID asli user; amount → BigInt', async () => {
    llm.complete.mockResolvedValue(reply(out()));
    const meter = new UsageMeter();
    const res = await parser.parse(input, meter);
    expect(res).toMatchObject({ type: 'EXPENSE', amount: 18_000n, categoryId: 'cat-expense-makan', walletId: 'uuid-gopay', merchant: 'mie ayam', confidence: 0.9 });
    expect(meter).toMatchObject({ promptTokens: 100, completionTokens: 30, calls: 1 });
  });

  it('model hanya melihat kode alias, bukan ID asli; skema JSON membatasi kode ke daftar user', async () => {
    llm.complete.mockResolvedValue(reply(out()));
    await parser.parse(input);
    const params = llm.complete.mock.calls[0][0];
    const userMessage = params.messages[1].content as string;
    expect(userMessage).toContain('c1 | Makan & Minum | EXPENSE');
    expect(userMessage).toContain('w2 | GoPay');
    expect(userMessage).not.toContain('uuid-gopay');
    expect(userMessage).not.toContain('cat-expense-makan');
    const props = params.response_format.json_schema.schema.properties;
    expect(props.categoryId.anyOf[0].enum).toEqual(['c1', 'c2']);
    expect(props.walletId.anyOf[0].enum).toEqual(['w1', 'w2']);
  });

  it('ID kategori/dompet palsu dari model ditolak: retry 1× dengan pesan jelas → AiParseError; tidak pernah lolos', async () => {
    llm.complete.mockResolvedValue(reply(out({ categoryId: 'cat-expense-makan', walletId: 'w99' })));
    await expect(parser.parse(input)).rejects.toBeInstanceOf(AiParseError);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    const retry = llm.complete.mock.calls[1][0].messages.at(-1).content as string;
    expect(retry).toContain('categoryId');
    expect(retry).toContain('walletId');
  });

  it('retry berhasil bila model memperbaiki kode', async () => {
    llm.complete.mockResolvedValueOnce(reply(out({ categoryId: 'c9' }))).mockResolvedValueOnce(reply(out({ categoryId: 'c1' })));
    expect((await parser.parse(input)).categoryId).toBe('cat-expense-makan');
  });

  it('kategori bertipe tidak cocok dengan type ditolak', async () => {
    llm.complete.mockResolvedValue(reply(out({ type: 'EXPENSE', categoryId: 'c2' })));
    await expect(parser.parse(input)).rejects.toBeInstanceOf(AiParseError);
  });

  it('TRANSFER: kategori selalu null, toWalletId dipetakan; non-transfer: toWalletId dibuang', async () => {
    llm.complete.mockResolvedValue(reply(out({ type: 'TRANSFER', categoryId: null, walletId: 'w1', toWalletId: 'w2', amount: 500000 })));
    expect(await parser.parse(input)).toMatchObject({ type: 'TRANSFER', categoryId: null, walletId: 'uuid-bca', toWalletId: 'uuid-gopay' });
    llm.complete.mockResolvedValue(reply(out({ toWalletId: 'w1' })));
    expect((await parser.parse(input)).toWalletId).toBeNull();
  });

  it('amount null (pesan tanpa nominal) diterima sebagai null; confidence di luar 0..1 ditolak', async () => {
    llm.complete.mockResolvedValue(reply(out({ amount: null, confidence: 0.2 })));
    expect((await parser.parse(input)).amount).toBeNull();
    llm.complete.mockResolvedValue(reply(out({ confidence: 1.5 })));
    await expect(parser.parse(input)).rejects.toBeInstanceOf(AiParseError);
  });

  it('<think> dibuang dan teks pesan dipotong 500 karakter', async () => {
    llm.complete.mockResolvedValue(reply(`<think>hmm</think>${JSON.stringify(out())}`));
    await expect(parser.parse({ ...input, text: 'x'.repeat(2000) })).resolves.toMatchObject({ amount: 18_000n });
    expect((llm.complete.mock.calls[0][0].messages[1].content as string).length).toBeLessThan(900);
  });

  it('available mengikuti konfigurasi LLM', () => {
    expect(parser.available).toBe(true);
    expect(new AiTransactionParser(new FakeLlm({ get: () => undefined } as unknown as ConfigService), prompts).available).toBe(false);
  });
});
