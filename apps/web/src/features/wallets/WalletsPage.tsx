import { useState } from 'react';
import { Archive, ArchiveRestore, Banknote, Landmark, Pencil, Plus, RefreshCw, Smartphone, Star, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { formatMoney } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useCreateWallet, useDeleteWallet, useUpdateWallet, useWallets } from './hooks';
import { WalletForm } from './components/WalletForm';
import { formatPct, formatSigned, walletTypeLabel } from './labels';
import { ValuationDialog } from './components/ValuationDialog';
import { investmentTotals } from './investment';
import type { WalletDto } from './api';

const TYPE_ICONS = { CASH: Banknote, BANK: Landmark, EWALLET: Smartphone, INVESTMENT: TrendingUp } as const;

const gainClass = (v: string) => (BigInt(v) > 0n ? 'text-income' : BigInt(v) < 0n ? 'text-expense' : 'text-muted');

const formatDate = (iso: string) => iso.slice(0, 10);

type FormState = { mode: 'create' } | { mode: 'edit'; wallet: WalletDto } | null;

export function WalletsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<WalletDto | null>(null);
  const [valuing, setValuing] = useState<WalletDto | null>(null);

  const { data: wallets, isLoading, error, refetch } = useWallets(showArchived);
  const create = useCreateWallet();
  const update = useUpdateWallet();
  const remove = useDeleteWallet();

  const totals = investmentTotals(wallets ?? []);

  const closeForm = () => {
    setForm(null);
    create.reset();
    update.reset();
  };

  const toggleArchive = (wallet: WalletDto) =>
    update.mutate(
      { id: wallet.id, payload: { isArchived: !wallet.isArchived } },
      {
        onSuccess: () => toast.success(wallet.isArchived ? 'Dompet diaktifkan kembali' : 'Dompet diarsipkan'),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  const makeDefault = (wallet: WalletDto) =>
    update.mutate(
      { id: wallet.id, payload: { isDefault: !wallet.isDefault } },
      {
        onSuccess: () => toast.success(wallet.isDefault ? 'Dompet default dicabut' : `${wallet.name} jadi dompet default`),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Dompet dihapus');
        setToDelete(null);
      },
      onError: (e) => {
        toast.error(getErrorMessage(e));
        setToDelete(null);
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Dompet"
        subtitle="Kelola tempat uangmu. Saldo dihitung otomatis dari transaksi."
        actions={
          <Button onClick={() => setForm({ mode: 'create' })}>
            <Plus className="h-4 w-4" /> Tambah dompet
          </Button>
        }
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Tampilkan yang diarsipkan
      </label>

      {totals && (
        <Card className="mb-4" data-testid="investment-summary">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total investasi</p>
          <p className="mt-1 text-2xl font-bold text-fg">{formatMoney(totals.value)}</p>
          <p className="mt-1 text-sm text-muted">
            Modal {formatMoney(totals.capital)} ·{' '}
            <span className={gainClass(totals.unrealized)}>
              {formatSigned(totals.unrealized, formatMoney)}
              {totals.unrealizedPct !== null && ` (${formatPct(totals.unrealizedPct)})`}
            </span>
          </p>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat dompet.')} onRetry={() => refetch()} />
      ) : !wallets || wallets.length === 0 ? (
        <EmptyState
          message="Belum ada dompet. Tambahkan dompet pertamamu untuk mulai mencatat."
          action={<Button onClick={() => setForm({ mode: 'create' })}>Tambah dompet</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((w) => {
            const Icon = TYPE_ICONS[w.type];
            return (
              <Card key={w.id} className={cn('flex flex-col gap-3', w.isArchived && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2"
                    style={{ backgroundColor: w.color ?? undefined }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{w.name}</p>
                    <p className="text-xs text-muted">
                      {walletTypeLabel(w.type)}
                      {w.isDefault && ' · Default'}
                      {w.isArchived && ' · Diarsipkan'}
                    </p>
                  </div>
                </div>
                <p className={cn('text-2xl font-bold', BigInt(w.balance) < 0n ? 'text-expense' : 'text-fg')}>
                  {formatMoney(w.balance)}
                </p>
                {w.investment && (
                  <div className="space-y-1 text-sm" data-testid="investment-card">
                    <p className="text-muted">
                      Modal <span className="text-fg">{formatMoney(w.investment.capital)}</span>
                    </p>
                    <p className={gainClass(w.investment.unrealized)}>
                      {BigInt(w.investment.unrealized) > 0n ? 'Untung' : BigInt(w.investment.unrealized) < 0n ? 'Rugi' : 'Impas'}{' '}
                      {formatSigned(w.investment.unrealized, formatMoney)}
                      {w.investment.unrealizedPct !== null && ` (${formatPct(w.investment.unrealizedPct)})`}
                      <span className="text-xs text-muted"> · belum direalisasi</span>
                    </p>
                    <p className="text-xs text-muted">
                      {w.investment.lastAdjustedAt ? `Diperbarui ${formatDate(w.investment.lastAdjustedAt)}` : 'Belum pernah diperbarui'}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {w.type === 'INVESTMENT' && !w.isArchived && (
                    <Button variant="ghost" size="sm" onClick={() => setValuing(w)}>
                      <RefreshCw className="h-3 w-3" /> Perbarui nilai
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setForm({ mode: 'edit', wallet: w })}>
                    <Pencil className="h-3 w-3" /> Ubah
                  </Button>
                  {!w.isArchived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => makeDefault(w)}
                      disabled={update.isPending}
                      aria-pressed={w.isDefault}
                      title="Dompet default dipakai bot Telegram saat dompet tidak disebut"
                    >
                      <Star className={cn('h-3 w-3', w.isDefault && 'fill-warning text-warning')} />
                      {w.isDefault ? 'Default' : 'Jadikan default'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => toggleArchive(w)} disabled={update.isPending}>
                    {w.isArchived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                    {w.isArchived ? 'Aktifkan' : 'Arsipkan'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setToDelete(w)} aria-label={`Hapus ${w.name}`}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && closeForm()}>
        {form && (
          <DialogContent title={form.mode === 'create' ? 'Tambah dompet' : 'Ubah dompet'}>
            <WalletForm
              wallet={form.mode === 'edit' ? form.wallet : undefined}
              submitting={create.isPending || update.isPending}
              error={form.mode === 'create' ? create.error : update.error}
              onCancel={closeForm}
              onSubmit={(payload) => {
                const done = {
                  onSuccess: () => {
                    toast.success('Dompet disimpan');
                    closeForm();
                  },
                };
                if (form.mode === 'create') create.mutate(payload, done);
                else update.mutate({ id: form.wallet.id, payload }, done);
              }}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={valuing !== null} onOpenChange={(o) => !o && setValuing(null)}>
        {valuing && (
          <DialogContent title={`Perbarui nilai ${valuing.name}`}>
            <ValuationDialog wallet={valuing} onClose={() => setValuing(null)} />
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Hapus dompet?"
        description={`Dompet "${toDelete?.name ?? ''}" akan dihapus permanen. Dompet yang sudah punya transaksi tidak bisa dihapus; arsipkan saja.`}
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
