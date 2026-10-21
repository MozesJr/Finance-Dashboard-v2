---
name: bot-command
description: Use when adding or changing a Telegram/WhatsApp bot command, message handler, or inline-button flow in apps/api/src/modules/bot.
---
# Bot command

## Architecture
- bot/core/        — channel-agnostic: BotCore, command handlers, reply builders. Works with IncomingMessage / OutgoingMessage types.
- bot/adapters/    — TelegramAdapter (grammY), later WhatsAppAdapter. Both implement ChannelAdapter. Adapters ONLY translate platform <-> core types.
- Handlers call domain services (transactions, savings, ai). Never Prisma directly.

## Rules
- Resolve user from TelegramLink by chatId. If not linked → ask to /link. If user status != ACTIVE → refuse politely.
- Any message that creates/changes data: save as DRAFT, reply with preview + buttons [✅ Simpan] [✏️ Kategori] [❌ Batal]. Only CONFIRM on button press.
- Callback data format: "<action>:<entityId>" (keep under 64 bytes for Telegram).
- Format money with shared formatRupiah(); dates in Asia/Jakarta.
- Replies in Bahasa Indonesia, short, max ~10 lines.
- Run the local amount parser (e.g. "35rb", "1,2jt") before calling the LLM.

## Steps
1. Add handler in bot/core/handlers/<name>.handler.ts and register it in BotCore.
2. Add the command to /help text and setMyCommands list.
3. Unit test the handler with a fake adapter.
