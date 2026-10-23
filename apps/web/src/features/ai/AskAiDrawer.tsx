import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Send, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useAskAi, useChatHistory, useClearChat } from './hooks';

const SUGGESTIONS = [
  'Berapa pengeluaranku bulan ini?',
  'Kategori apa yang paling besar?',
  'Berapa saldo semua dompetku?',
  'Bagaimana progres tabunganku?',
];

/** Drawer "Tanya AI": percakapan tentang data keuanganmu (AI memanggil data lewat tools, bukan menebak). */
export function AskAiDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: history, isLoading, error: historyError } = useChatHistory(open);
  const ask = useAskAi();
  const clear = useClearChat();

  const messages = history ?? [];
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length, pending, ask.isPending]);

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || ask.isPending) return;
    setPending(trimmed);
    setText('');
    ask.mutate(trimmed, { onSettled: () => setPending(null) });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <DialogPrimitive.Title className="flex items-center gap-2 font-semibold text-fg">
              <Sparkles className="h-4 w-4 text-primary" /> Tanya AI
            </DialogPrimitive.Title>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="icon" aria-label="Hapus riwayat" onClick={() => clear.mutate()} disabled={clear.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <DialogPrimitive.Close className="rounded p-2 text-muted hover:text-fg" aria-label="Tutup">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {isLoading ? (
              <Skeleton className="h-24" />
            ) : historyError ? (
              <p className="text-sm text-expense">{getErrorMessage(historyError, 'Gagal memuat riwayat.')}</p>
            ) : messages.length === 0 && !pending ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Tanyakan apa saja tentang keuanganmu. Aku hanya memakai data akunmu sendiri.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <Bubble key={m.id} role={m.role} text={m.content} />
                ))}
                {pending && <Bubble role="USER" text={pending} />}
              </>
            )}
            {ask.isPending && <p className="text-xs text-muted">Berpikir…</p>}
            {ask.error != null && (
              <p role="alert" className="rounded-md border border-expense/40 p-3 text-sm text-expense">
                {getErrorMessage(ask.error, 'Pertanyaan gagal diproses.')}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <Input
              aria-label="Pertanyaan"
              placeholder="Tulis pertanyaan…"
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
              disabled={ask.isPending}
            />
            <Button type="submit" size="icon" aria-label="Kirim" disabled={ask.isPending || text.trim() === ''}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Bubble({ role, text }: { role: 'USER' | 'ASSISTANT'; text: string }) {
  const mine = role === 'USER';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <p
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
          mine ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg',
        )}
      >
        {text}
      </p>
    </div>
  );
}
