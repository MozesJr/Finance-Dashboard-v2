import { useState } from 'react';
import { Archive, ArchiveRestore, Banknote, Landmark, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
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
import { walletTypeLabel } from './labels';
import type { WalletDto } from './api';

const TYPE_ICONS = { CASH: Banknote, BANK: Landmark, EWALLET: Smartphone } as const;

type FormState = { mode: 'create' } | { mode: 'edit'; wallet: WalletDto } | null;

export function WalletsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<WalletDto | null>(null);

  const { data: wallets, isLoading, error, refetch } = useWallets(showArchived);
  const create = useCreateWallet();
  const update = useUpdateWallet();
  const remove = useDeleteWallet();

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
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: w.color ?? undefined }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{w.name}</p>
                    <p className="text-xs text-muted">
                      {walletTypeLabel(w.type)}
                      {w.isArchived && ' · Diarsipkan'}
                    </p>
                  </div>
                </div>
                <p className={cn('text-2xl font-bold', BigInt(w.balance) < 0n ? 'text-expense' : 'text-fg')}>
                  {formatMoney(w.balance)}
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setForm({ mode: 'edit', wallet: w })}>
                    <Pencil className="h-3 w-3" /> Ubah
                  </Button>
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
