/** Tipe channel-agnostic untuk bot. Adapter (Telegram/WhatsApp) hanya menerjemahkan platform ↔ tipe ini. */

export type ChannelName = 'TELEGRAM' | 'WHATSAPP' | 'SIMULATOR';

export interface InlineButton {
  text: string;
  /** Data callback ringkas (< 64 byte). */
  data: string;
}

export interface OutgoingMessage {
  text: string;
  /** Baris tombol inline. */
  buttons?: InlineButton[][];
}

/** 'edit' = ubah pesan yang membawa tombol yang ditekan (hanya untuk callback); 'send' = pesan baru. */
export interface BotReply {
  mode: 'send' | 'edit';
  message: OutgoingMessage;
}

interface InputBase {
  channel: ChannelName;
  chatId: string;
  isPrivate: boolean;
  /** Username platform pengirim (tanpa @), bila ada. */
  username?: string | null;
}

export interface IncomingMessage extends InputBase {
  kind: 'message';
  text: string;
}

export interface IncomingCallback extends InputBase {
  kind: 'callback';
  data: string;
}

export type BotInput = IncomingMessage | IncomingCallback;

/** User yang sudah terautentikasi lewat link chat. */
export interface BotUser {
  userId: string;
  chatId: string;
  channel: ChannelName;
}

/** Antarmuka siklus hidup adapter channel (Telegram sekarang, WhatsApp nanti). */
export interface ChannelAdapter {
  readonly channel: ChannelName;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const send = (text: string, buttons?: InlineButton[][]): BotReply => ({ mode: 'send', message: { text, buttons } });
export const edit = (text: string, buttons?: InlineButton[][]): BotReply => ({ mode: 'edit', message: { text, buttons } });

export const sendMessage = (message: OutgoingMessage): BotReply => ({ mode: 'send', message });
