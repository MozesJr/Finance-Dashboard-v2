---
name: ai-feature
description: Use when building anything that calls the LLM: receipt parsing, transaction text parsing, AI chat, insights or recommendations (apps/api/src/modules/ai).
---
# AI feature

## Client
- LlmClient wraps the OpenAI SDK. baseURL = env LLM_BASE_URL, apiKey = env LLM_API_KEY, model = env LLM_MODEL. No other place instantiates the SDK.
- Timeout 60s, temperature 0.1 for extraction, 0.5 for narration.

## Rules
- Prompts live in ai/prompts/<name>.md, loaded at startup. No inline prompt strings in code.
- Extraction tasks must return JSON only. Parse → validate with Zod schema from packages/shared → on failure retry once with the validation error appended → still fails: throw AiParseError (caller shows friendly message).
- The LLM NEVER writes or runs SQL and never touches Prisma. For AI chat use tool calling; tools map to existing service methods (e.g. getSpendingByCategory(userId, month)). userId is injected by the server, never by the model.
- Numbers in insights are computed in code first; the LLM receives the computed stats and only explains/recommends.
- Receipt parsing goes through ReceiptParser interface: VisionReceiptParser (image to LLM) and OcrReceiptParser (tesseract ind+eng → text → LLM). Choice via env RECEIPT_PARSER=vision|ocr.
- Cache insights in AiInsight (userId, period, kind); regenerate only via cron or explicit refresh.
- Log token usage / latency per call; never log full receipt images or personal notes.

## Steps
1. Write prompt file with: role, task, exact JSON shape, 2 short examples (Indonesian/English/Javanese mix inputs).
2. Add Zod schema for the output.
3. Implement method in the relevant ai service, using LlmClient.
4. Test with mocked LlmClient responses (valid, invalid JSON, wrong shape).
