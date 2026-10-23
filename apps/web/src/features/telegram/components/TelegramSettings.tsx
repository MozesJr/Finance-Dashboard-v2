import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getErrorMessage } from '@/lib/errors';
import type { LinkCodeDto } from '../api';
import { useCreateLinkCode, useTelegramStatus, useUnlinkTelegram } from '../hooks';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function TelegramSettings() {
  const [code, setCode] = useState<LinkCodeDto | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const remainingMs = code ? new Date(code.expiresAt).getTime() - now : 0;
  const codeActive = code !== null && remainingMs > 0;

  const { data: status, isLoading, error, refetch } = useTelegramStatus(codeActive);
  const waiting = codeActive && !status?.linked;
  const createCode = useCreateLinkCode();
  const unlink = useUnlinkTelegram();

  // Hitung mundur hanya saat ada kode aktif.
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  // Terhubung (terdeteksi lewat polling): sembunyikan kode dan beri tahu sekali.
  const linked = status?.linked ?? null;
  const isLinked = linked !== null;
  const hasCode = code !== null;
  useEffect(() => {
    if (isLinked && hasCode) toast.success('Telegram berhasil terhubung');
  }, [isLinked, hasCode]);

  const generate = () =>
    createCode.mutate(undefined, {
      onSuccess: (data) => {
        setNow(Date.now());
        setCode(data);
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });

  const doUnlink = () =>
    unlink.mutate(undefined, {
      onSuccess: () => {
        setCode(null);
        toast.success('Telegram diputuskan');
      },
      onError: (e) => toast.error(getErrorMessage(e)),
      onSettled: () => setConfirmUnlink(false),
    });

  const botHandle = code?.botUsername ?? status?.botUsername ?? null;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-fg">Telegram</h2>
      </div>
      <p className="text-sm text-muted">
        Catat transaksi lewat chat: kirim teks seperti <span className="text-fg">makan siang 35rb</span>, lalu simpan dengan satu tombol.
      </p>

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : error || !status ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat status Telegram.')} onRetry={() => refetch()} />
      ) : linked ? (
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
            <CheckCircle2 className="h-4 w-4 text-income" />
            Terhubung{linked.username ? <> sebagai <span className="font-medium">@{linked.username}</span></> : ' ke akun Telegram'} sejak{' '}
            {formatDate(linked.linkedAt)}
          </p>
          <Button variant="outline" onClick={() => setConfirmUnlink(true)}>
            Putuskan
          </Button>
        </div>
      ) : !status.botEnabled ? (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Bot Telegram belum aktif di server (token bot belum diisi). Hubungi admin.
        </p>
      ) : (
        <div className="space-y-3">
          {waiting && code ? (
            <div className="space-y-3 rounded-md border border-line bg-surface-2 p-4">
              <p className="text-xs text-muted">Kode hubung (sekali pakai)</p>
              <p className="font-mono text-3xl font-bold tracking-widest text-fg" aria-label="Kode hubung">
                {code.code}
              </p>
              <p className="text-xs text-muted">Berlaku {formatCountdown(remainingMs)} lagi</p>
              <p className="text-sm text-fg">
                Kirim ke {botHandle ? <span className="font-medium">@{botHandle}</span> : 'bot Telegram'}:{' '}
                <code className="rounded bg-surface px-1.5 py-0.5">/link {code.code}</code>
              </p>
              {botHandle && (
                <a
                  href={`https://t.me/${botHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Buka bot di Telegram <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="text-xs text-muted">Halaman ini otomatis berubah setelah terhubung.</p>
            </div>
          ) : (
            code && <p className="text-sm text-warning">Kode sudah kedaluwarsa. Buat kode baru.</p>
          )}
          <Button onClick={generate} disabled={createCode.isPending}>
            {createCode.isPending ? 'Membuat kode…' : code ? 'Buat kode baru' : 'Hubungkan'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmUnlink}
        title="Putuskan Telegram?"
        description="Bot tidak akan lagi melayani chat itu. Draft yang belum disimpan tetap ada sampai kedaluwarsa. Kamu bisa menghubungkan lagi kapan saja."
        confirmLabel="Putuskan"
        loading={unlink.isPending}
        onConfirm={doUnlink}
        onCancel={() => setConfirmUnlink(false)}
      />
    </Card>
  );
}
