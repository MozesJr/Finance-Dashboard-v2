import { ConfigService } from '@nestjs/config';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { z } from 'zod';
import { AiParseError, AiQuotaError, AiUnavailableError } from './ai.errors';
import { AiUsageRepository } from './ai-usage.repository';
import { AiUsageService, startOfJakartaDay } from './ai-usage.service';
import { AiSchema, LlmClient } from './llm-client.service';
import { createNormalizingFetch } from './normalizing-fetch';
import { PromptService } from './prompt.service';
import { extractJson, stripThink } from './think';
import { UsageMeter } from './usage-meter';

const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const completion = (content: string | null, extra: Record<string, unknown> = {}) => ({
  choices: [{ message: { content, ...extra }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

class TestableLlm extends LlmClient {
  complete = jest.fn();
}

const SCHEMA: AiSchema<{ amount: number }> = {
  name: 'amount',
  zod: z.object({ amount: z.number().int().positive() }),
  json: { type: 'object', properties: { amount: { type: 'integer' } }, required: ['amount'], additionalProperties: false },
};

describe('think helpers', () => {
  it('stripThink: blok lengkap, penutup tanpa pembuka, pembuka terpotong', () => {
    expect(stripThink('<think>mikir dulu</think>\n{"a":1}')).toBe('{"a":1}');
    expect(stripThink('mikir tanpa pembuka</think>{"a":1}')).toBe('{"a":1}');
    expect(stripThink('Halo<think>terpotong...')).toBe('Halo');
    expect(stripThink('<THINK>x</THINK>ok')).toBe('ok');
    expect(stripThink('tanpa think')).toBe('tanpa think');
  });

  it('extractJson: pagar kode dan teks di sekitar JSON', () => {
    expect(JSON.parse(extractJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(JSON.parse(extractJson('Berikut hasilnya: {"a":1} semoga membantu'))).toEqual({ a: 1 });
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe('createNormalizingFetch', () => {
  it('membersihkan "data: [DONE]" dan mengatur content-type JSON (perilaku gateway nyata)', async () => {
    const body = '{"id":"x","choices":[]}data: [DONE]\n\n';
    const base = jest.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const res = await createNormalizingFetch(base as never)('http://x', {});
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ id: 'x', choices: [] });
  });

  it('body JSON biasa tidak diubah; status error tetap diteruskan', async () => {
    const base = jest.fn().mockResolvedValue(new Response('{"error":{"message":"bad"}}', { status: 400, headers: { 'content-type': 'application/json' } }));
    const res = await createNormalizingFetch(base as never)('http://x', {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { message: 'bad' } });
  });
});

describe('LlmClient', () => {
  const make = (values: Record<string, string> = { LLM_API_KEY: 'k', LLM_BASE_URL: 'http://llm', LLM_MODEL: 'm' }) => new TestableLlm(config(values));

  it('tanpa API key → AiUnavailableError (tanpa memanggil jaringan)', async () => {
    const llm = make({});
    expect(llm.enabled).toBe(false);
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('chat: membuang <think>, mengukur token & latensi ke meter, memakai model default', async () => {
    const llm = make();
    llm.complete.mockResolvedValue(completion('<think>hmm</think>Halo!'));
    const meter = new UsageMeter();
    const res = await llm.chat({ messages: [{ role: 'user', content: 'hi' }], meter });
    expect(res.content).toBe('Halo!');
    expect(meter).toMatchObject({ promptTokens: 10, completionTokens: 5, calls: 1 });
    expect(meter.latencyMs).toBeGreaterThanOrEqual(0);
    expect(llm.complete.mock.calls[0][0]).toMatchObject({ model: 'm', stream: false });
  });

  it('chat: mengembalikan tool_calls, dan tool_choice selalu auto', async () => {
    const llm = make();
    llm.complete.mockResolvedValue(
      completion(null, { tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_summary', arguments: '{"month":"2026-10"}' } }] }),
    );
    const res = await llm.chat({
      messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'get_summary', description: 'd', parameters: { type: 'object', properties: {} } }],
    });
    expect(res.toolCalls).toEqual([{ id: 't1', name: 'get_summary', arguments: '{"month":"2026-10"}' }]);
    expect(llm.complete.mock.calls[0][0].tool_choice).toBe('auto');
  });

  it('retry 1× untuk error jaringan lalu sukses', async () => {
    const llm = make();
    llm.complete.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(completion('ok'));
    expect((await llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).content).toBe('ok');
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('retry 1× untuk 5xx, lalu gagal → AiUnavailableError (maks 2 panggilan)', async () => {
    const llm = make();
    llm.complete.mockRejectedValue(Object.assign(new Error('boom'), { status: 503 }));
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('4xx (selain 400 response_format) tidak di-retry', async () => {
    const llm = make();
    llm.complete.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('pesan error tidak membocorkan API key', async () => {
    const llm = make({ LLM_API_KEY: 'rahasia-123', LLM_BASE_URL: 'http://llm', LLM_MODEL: 'm' });
    llm.complete.mockRejectedValue(Object.assign(new Error('Bearer rahasia-123 ditolak'), { status: 401 }));
    const warn = jest.spyOn(llm['logger'], 'warn').mockImplementation();
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('rahasia-123');
  });

  it('structured: JSON valid → data; response_format json_schema strict dikirim', async () => {
    const llm = make();
    llm.complete.mockResolvedValue(completion('{"amount": 35000}'));
    expect(await llm.structured({ messages: [{ role: 'user', content: 'x' }], schema: SCHEMA })).toEqual({ amount: 35000 });
    expect(llm.complete.mock.calls[0][0].response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'amount', strict: true } });
  });

  it('structured: <think> + pagar kode tetap terbaca', async () => {
    const llm = make();
    llm.complete.mockResolvedValue(completion('<think>..</think>```json\n{"amount": 5}\n```'));
    expect(await llm.structured({ messages: [{ role: 'user', content: 'x' }], schema: SCHEMA })).toEqual({ amount: 5 });
  });

  it('structured: JSON invalid → retry 1× dengan pesan error validasi → sukses', async () => {
    const llm = make();
    llm.complete.mockResolvedValueOnce(completion('bukan json')).mockResolvedValueOnce(completion('{"amount": 7}'));
    expect(await llm.structured({ messages: [{ role: 'user', content: 'x' }], schema: SCHEMA })).toEqual({ amount: 7 });
    expect(llm.complete).toHaveBeenCalledTimes(2);
    const retryMessages = llm.complete.mock.calls[1][0].messages;
    expect(retryMessages[retryMessages.length - 1].content).toContain('Output tidak valid');
  });

  it('structured: bentuk salah dua kali → AiParseError (maks 2 panggilan, pesan validasi menyebut field)', async () => {
    const llm = make();
    llm.complete.mockResolvedValue(completion('{"amount": -5}'));
    await expect(llm.structured({ messages: [{ role: 'user', content: 'x' }], schema: SCHEMA })).rejects.toBeInstanceOf(AiParseError);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(llm.complete.mock.calls[1][0].messages.at(-1).content).toContain('amount');
  });

  it('server menolak response_format (400) → diulang tanpa response_format', async () => {
    const llm = make();
    llm.complete.mockRejectedValueOnce(Object.assign(new Error('unsupported response_format'), { status: 400 })).mockResolvedValueOnce(completion('{"amount": 9}'));
    expect(await llm.structured({ messages: [{ role: 'user', content: 'x' }], schema: SCHEMA })).toEqual({ amount: 9 });
    expect(llm.complete.mock.calls[1][0].response_format).toBeUndefined();
  });
});

describe('AiUsageService', () => {
  let repo: jest.Mocked<AiUsageRepository>;
  let service: AiUsageService;

  beforeEach(() => {
    repo = { create: jest.fn(), count: jest.fn().mockResolvedValue(0) } as unknown as jest.Mocked<AiUsageRepository>;
    service = new AiUsageService(repo, config({}));
  });

  it('batas default: chat 30, insight 5, struk 30, parse 50; env menimpa', () => {
    expect([service.limitFor('CHAT'), service.limitFor('INSIGHT'), service.limitFor('RECEIPT'), service.limitFor('PARSE')]).toEqual([30, 5, 30, 50]);
    const custom = new AiUsageService(repo, config({ AI_LIMIT_CHAT_PER_DAY: '3', AI_LIMIT_INSIGHT_PER_DAY: 'abc' }));
    expect(custom.limitFor('CHAT')).toBe(3);
    expect(custom.limitFor('INSIGHT')).toBe(5);
  });

  it('kuota habis → AiQuotaError 429 dengan pesan jelas; fn tidak dijalankan', async () => {
    repo.count.mockResolvedValue(5);
    const fn = jest.fn();
    const err = (await service.track('u1', 'INSIGHT', fn).catch((e: unknown) => e)) as AiQuotaError;
    expect(err).toBeInstanceOf(AiQuotaError);
    expect(err.getStatus()).toBe(429);
    expect(err.message).toContain('5/hari');
    expect(fn).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('kuota dihitung per user & fitur sejak awal hari Asia/Jakarta', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T20:00:00Z')); // 24 Okt 03:00 WIB
    try {
      await service.assertAllowed('u1', 'CHAT');
      const [userId, feature, since] = repo.count.mock.calls[0];
      expect([userId, feature]).toEqual(['u1', 'CHAT']);
      expect(since.toISOString()).toBe('2026-10-23T17:00:00.000Z'); // 00:00 WIB 24 Okt
    } finally {
      jest.useRealTimers();
    }
    expect(startOfJakartaDay(new Date('2026-10-23T16:59:00Z')).toISOString()).toBe('2026-10-22T17:00:00.000Z');
  });

  it('track: mencatat token/latensi saat sukses (tanpa isi prompt), dan success=false saat gagal', async () => {
    const result = await service.track('u1', 'CHAT', async (meter) => {
      meter.add({ promptTokens: 100, completionTokens: 20, latencyMs: 800 });
      meter.add({ promptTokens: 50, completionTokens: 10, latencyMs: 400 });
      return 'jawaban';
    });
    expect(result).toBe('jawaban');
    expect(repo.create).toHaveBeenCalledWith({ userId: 'u1', feature: 'CHAT', promptTokens: 150, completionTokens: 30, latencyMs: 1200, success: true });

    await expect(
      service.track('u1', 'CHAT', async () => {
        throw new AiUnavailableError();
      }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ success: false }));
    expect(Object.keys(repo.create.mock.calls[0][0]).sort()).toEqual(['completionTokens', 'feature', 'latencyMs', 'promptTokens', 'success', 'userId']);
  });

  it('skipQuota (job) tidak memeriksa kuota; gagal mencatat tidak mematahkan hasil', async () => {
    repo.count.mockResolvedValue(999);
    repo.create.mockRejectedValue(new Error('db down'));
    await expect(service.track('u1', 'INSIGHT', async () => 'ok', { skipQuota: true })).resolves.toBe('ok');
    expect(repo.count).not.toHaveBeenCalled();
  });
});

describe('PromptService', () => {
  it('memuat *.md dan mengganti {{variabel}}; prompt tak dikenal → error', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'prompts-'));
    writeFileSync(path.join(dir, 'halo.md'), 'Halo {{nama}}, hari ini {{tanggal}}.\n');
    writeFileSync(path.join(dir, 'abaikan.txt'), 'x');
    const prompts = new PromptService();
    prompts.load(dir);
    expect(prompts.get('halo', { nama: 'Budi', tanggal: '2026-10-23' })).toBe('Halo Budi, hari ini 2026-10-23.');
    expect(() => prompts.get('abaikan')).toThrow('tidak ditemukan');
  });

  it('direktori tidak ada → kosong, tidak crash', () => {
    const prompts = new PromptService();
    expect(() => prompts.load('/path/tidak/ada')).not.toThrow();
  });
});
