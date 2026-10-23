import { BotCore } from '../bot-core.service';
import { BotReply, ChannelAdapter, InlineButton } from '../types';

export interface FakeMessage {
  id: number;
  text: string;
  buttons: InlineButton[][];
}

/**
 * Adapter palsu yang meniru semantik chat Telegram: balasan 'send' menambah pesan,
 * 'edit' mengubah pesan yang membawa tombol yang ditekan.
 */
export class FakeChannelAdapter implements ChannelAdapter {
  readonly channel = 'SIMULATOR' as const;
  readonly messages: FakeMessage[] = [];
  private seq = 0;

  constructor(
    private core: BotCore,
    readonly chatId: string,
    private isPrivate = true,
  ) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  /** Pengguna mengirim teks. Mengembalikan pesan baru yang diterima. */
  async say(text: string): Promise<FakeMessage[]> {
    const replies = await this.core.handle({
      kind: 'message',
      channel: this.channel,
      chatId: this.chatId,
      isPrivate: this.isPrivate,
      text,
    });
    return this.apply(replies, null);
  }

  /** Pengguna mengirim foto. */
  async sendPhoto(image: Buffer): Promise<FakeMessage[]> {
    const replies = await this.core.handle({
      kind: 'photo',
      channel: this.channel,
      chatId: this.chatId,
      isPrivate: this.isPrivate,
      image,
    });
    return this.apply(replies, null);
  }

  /** Pengguna menekan tombol berdata `data` (pada pesan terbaru yang memuatnya). */
  async press(data: string): Promise<FakeMessage[]> {
    const target = [...this.messages].reverse().find((m) => m.buttons.some((row) => row.some((b) => b.data === data))) ?? null;
    const replies = await this.core.handle({
      kind: 'callback',
      channel: this.channel,
      chatId: this.chatId,
      isPrivate: this.isPrivate,
      data,
    });
    return this.apply(replies, target);
  }

  get last(): FakeMessage {
    return this.messages[this.messages.length - 1];
  }

  /** Semua data tombol pada pesan terakhir. */
  get lastButtonData(): string[] {
    return this.last.buttons.flat().map((b) => b.data);
  }

  private apply(replies: BotReply[], target: FakeMessage | null): FakeMessage[] {
    const created: FakeMessage[] = [];
    for (const r of replies) {
      const buttons = r.message.buttons ?? [];
      if (r.mode === 'edit' && target) {
        target.text = r.message.text;
        target.buttons = buttons;
      } else {
        const m: FakeMessage = { id: ++this.seq, text: r.message.text, buttons };
        this.messages.push(m);
        created.push(m);
      }
    }
    return created;
  }
}
