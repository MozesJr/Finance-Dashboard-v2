import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ZodType } from 'zod';
import { AiParseError, AiUnavailableError } from './ai.errors';
import { createNormalizingFetch } from './normalizing-fetch';
import { extractJson, stripThink } from './think';
import { UsageMeter } from './usage-meter';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  name: string;
  /** JSON string dari model (belum divalidasi). */
  arguments: string;
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Skema keluaran terstruktur: validator Zod (sumber kebenaran) + JSON schema untuk response_format. */
export interface AiSchema<T> {
  name: string;
  zod: ZodType<T>;
  json: Record<string, unknown>;
}

export interface LlmCallOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  /** 'required' memaksa model memanggil tool (didukung gateway); paksa-fungsi tertentu sengaja tidak disediakan. */
  toolChoice?: 'auto' | 'required';
  jsonSchema?: Pick<AiSchema<unknown>, 'name' | 'json'>;
  /** Timpa model default (mis. RECEIPT_VISION_MODEL). */
  model?: string;
  meter?: UsageMeter;
}

export interface LlmResponse {
  /** Teks tanpa blok <think>. */
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
}

const TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 500;

/** Satu-satunya tempat yang membuat client SDK OpenAI. */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);
  private sdk: OpenAI | null = null;

  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('LLM_API_KEY')?.trim() && this.config.get<string>('LLM_BASE_URL')?.trim());
  }

  get defaultModel(): string {
    return this.config.get<string>('LLM_MODEL')?.trim() || 'default';
  }

  /** Panggilan chat biasa (bisa dengan tools / response_format). Retry 1× untuk error jaringan/5xx. */
  async chat(options: LlmCallOptions): Promise<LlmResponse> {
    if (!this.enabled) throw new AiUnavailableError('AI belum dikonfigurasi di server.');

    let useJsonSchema = Boolean(options.jsonSchema);
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const completion = await this.complete(this.buildParams(options, useJsonSchema));
        options.meter?.add({
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          latencyMs: Date.now() - started,
        });
        const message = completion.choices?.[0]?.message;
        return {
          content: stripThink(message?.content ?? ''),
          toolCalls: (message?.tool_calls ?? [])
            .filter((c) => c.type === 'function')
            .map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments ?? '{}' })),
          finishReason: completion.choices?.[0]?.finish_reason ?? null,
        };
      } catch (error) {
        options.meter?.add({ latencyMs: Date.now() - started });
        const status = this.statusOf(error);
        if (status === 400 && useJsonSchema) {
          // Server menolak response_format: ulangi tanpa itu (validasi Zod tetap berjalan).
          useJsonSchema = false;
          continue;
        }
        if (attempt === 0 && this.isRetryable(error, status)) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        this.logger.warn(`Panggilan LLM gagal (status=${status ?? 'network'}): ${this.safeMessage(error)}`);
        throw new AiUnavailableError();
      }
    }
  }

  /**
   * Keluaran terstruktur: JSON → Zod. Gagal → retry 1× dengan pesan error validasi → AiParseError.
   */
  async structured<T>(options: Omit<LlmCallOptions, 'jsonSchema'> & { schema: AiSchema<T> }): Promise<T> {
    const { schema, ...rest } = options;
    const messages: LlmMessage[] = [...rest.messages];

    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.chat({ ...rest, messages, jsonSchema: schema });
      const parsed = this.parse(response.content, schema);
      if (parsed.ok) return parsed.data;

      lastProblem = parsed.problem;
      messages.push(
        { role: 'assistant', content: response.content },
        { role: 'user', content: `Output tidak valid: ${parsed.problem}\nPerbaiki dan balas HANYA dengan JSON yang sesuai skema.` },
      );
    }
    this.logger.warn(`Output AI tidak valid setelah retry (${schema.name}): ${lastProblem.slice(0, 200)}`);
    throw new AiParseError();
  }

  // ------------------------------------------------------------------ internal

  private parse<T>(content: string, schema: AiSchema<T>): { ok: true; data: T } | { ok: false; problem: string } {
    let value: unknown;
    try {
      value = JSON.parse(extractJson(content));
    } catch {
      return { ok: false, problem: 'bukan JSON yang valid' };
    }
    const result = schema.zod.safeParse(value);
    if (result.success) return { ok: true, data: result.data };
    const problem = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, problem };
  }

  protected complete(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion> {
    return this.client().chat.completions.create(params);
  }

  private client(): OpenAI {
    if (!this.sdk) {
      this.sdk = new OpenAI({
        baseURL: this.config.get<string>('LLM_BASE_URL'),
        apiKey: this.config.get<string>('LLM_API_KEY'),
        timeout: TIMEOUT_MS,
        maxRetries: 0, // retry diatur sendiri di chat()
        fetch: createNormalizingFetch(),
      });
    }
    return this.sdk;
  }

  private buildParams(options: LlmCallOptions, useJsonSchema: boolean): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: options.model ?? this.defaultModel,
      messages: options.messages.map(toSdkMessage),
      temperature: options.temperature ?? 0.1,
      stream: false,
    };
    if (options.maxTokens) params.max_tokens = options.maxTokens;
    if (options.tools?.length) {
      params.tools = options.tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      params.tool_choice = options.toolChoice ?? 'auto'; // paksa-fungsi tertentu lambat & tidak stabil di gateway ini
    }
    if (useJsonSchema && options.jsonSchema) {
      params.response_format = {
        type: 'json_schema',
        json_schema: { name: options.jsonSchema.name, strict: true, schema: options.jsonSchema.json },
      };
    }
    return params;
  }

  private statusOf(error: unknown): number | undefined {
    return typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
  }

  private isRetryable(error: unknown, status: number | undefined): boolean {
    if (status === undefined) return true; // jaringan / timeout
    return status >= 500 || status === 429;
  }

  /** Pesan error tanpa API key. */
  private safeMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const key = this.config.get<string>('LLM_API_KEY');
    return key ? message.split(key).join('***') : message;
  }
}

function toSdkMessage(m: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content as string };
    case 'user':
      return { role: 'user', content: m.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
}
