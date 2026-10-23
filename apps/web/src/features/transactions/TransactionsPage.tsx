import { useMemo, useState } from 'react';
import { ArrowRight, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { ReceiptViewerDialog } from '@/features/receipts/components/ReceiptViewerDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { TransactionDto, TransactionFilters } from './api';
import { TransactionFiltersBar } from './components/TransactionFilters';
import { TransactionForm } from './components/TransactionForm';
import { useCreateTransaction, useDeleteTransaction, useTransactions, useUpdateTransaction } from './hooks';
import { TX_TYPE_CLASS, TX_TYPE_LABELS, TX_TYPE_SIGN } from './labels';

type FormState = { mode: 'create' } | { mode: 'edit'; transaction: TransactionDto } | null;

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function Amount({ tx }: { tx: TransactionDto }) {
  if (tx.type === 'ADJUSTMENT') {
    const n = BigInt(tx.amount);
    return (
      <span className={cn('font-semibold tabular-nums', n >= 0n ? 'text-income' : 'text-expense')}>
        {n > 0n ? '+' : ''}
        {formatMoney(n)}
      </span>
    );
  }
  return (
    <span className={cn('font-semibold tabular-nums', TX_TYPE_CLASS[tx.type])}>
      {TX_TYPE_SIGN[tx.type]}
      {formatMoney(tx.amount)}
    </span>
  );
}

function Title({ tx }: { tx: TransactionDto }) {
  if (tx.type === 'TRANSFER') {
    return (
      <span className="inline-flex items-center gap-1">
        {tx.wallet.name} <ArrowRight className="h-3 w-3" /> {tx.toWallet?.name ?? '—'}
      </span>
    );
  }
  if (tx.type === 'ADJUSTMENT') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Penyesuaian nilai</span>
      </span>
    );
  }
  return <>{tx.merchant || tx.category?.name || TX_TYPE_LABELS[tx.type]}</>;
}

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<TransactionDto | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  // Pencarian teks di-debounce; filter lain langsung.
  const debouncedQ = useDebouncedValue(filters.q, 400);
  const effective = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useTransactions(effective);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const hasFilters = Object.values(effective).some(Boolean);

  const closeForm = () => {
    setForm(null);
    create.reset();
    update.reset();
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => toast.success('Transaksi dihapus'),
      onError: (e) => toast.error(getErrorMessage(e)),
      onSettled: () => setToDelete(null),
    });
  };

  const rowActions = (tx: TransactionDto) => (
    <div className="flex">
      {tx.receiptId && (
        <Button variant="ghost" size="icon" aria-label="Lihat struk" onClick={() => setReceiptId(tx.receiptId)}>
          <Receipt className="h-4 w-4" />
        </Button>
      )}
      {tx.type !== 'ADJUSTMENT' && (
        <Button variant="ghost" size="icon" aria-label="Ubah transaksi" onClick={() => setForm({ mode: 'edit', transaction: tx })}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Hapus transaksi" onClick={() => setToDelete(tx)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Transaksi"
        subtitle="Riwayat pemasukan, pengeluaran, dan transfer."
        actions={
          <Button onClick={() => setForm({ mode: 'create' })}>
            <Plus className="h-4 w-4" /> Tambah transaksi
          </Button>
        }
      />

      <TransactionFiltersBar value={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat transaksi.')} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          message={hasFilters ? 'Tidak ada transaksi yang cocok dengan filter.' : 'Belum ada transaksi. Catat transaksi pertamamu.'}
          action={
            hasFilters ? (
              <Button variant="outline" onClick={() => setFilters({})}>
                Reset filter
              </Button>
            ) : (
              <Button onClick={() => setForm({ mode: 'create' })}>Tambah transaksi</Button>
            )
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Keterangan</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Dompet</th>
                  <th className="px-4 py-3 text-right font-medium">Nominal</th>
                  <th className="w-24 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.id} className="border-b border-line/50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3 text-fg">
                      <Title tx={tx} />
                      {tx.note && <p className="text-xs text-muted">{tx.note}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {tx.category ? `${tx.category.icon ?? ''} ${tx.category.name}`.trim() : TX_TYPE_LABELS[tx.type]}
                    </td>
                    <td className="px-4 py-3 text-muted">{tx.wallet.name}</td>
                    <td className="px-4 py-3 text-right">
                      <Amount tx={tx} />
                    </td>
                    <td className="px-2 py-3">{rowActions(tx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile */}
          <ul className="space-y-2 md:hidden">
            {items.map((tx) => (
              <li key={tx.id}>
                <Card className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      <Title tx={tx} />
                    </p>
                    <p className="truncate text-xs text-muted">
                      {formatDate(tx.date)} · {tx.category?.name ?? TX_TYPE_LABELS[tx.type]} · {tx.wallet.name}
                    </p>
                  </div>
                  <Amount tx={tx} />
                  {rowActions(tx)}
                </Card>
              </li>
            ))}
          </ul>

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Memuat…' : 'Muat lebih banyak'}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && closeForm()}>
        {form && (
          <DialogContent title={form.mode === 'create' ? 'Tambah transaksi' : 'Ubah transaksi'}>
            <TransactionForm
              transaction={form.mode === 'edit' ? form.transaction : undefined}
              submitting={create.isPending || update.isPending}
              error={form.mode === 'create' ? create.error : update.error}
              onCancel={closeForm}
              onSubmit={(payload) => {
                const done = {
                  onSuccess: () => {
                    toast.success('Transaksi disimpan');
                    closeForm();
                  },
                };
                if (form.mode === 'create') create.mutate(payload, done);
                else update.mutate({ id: form.transaction.id, payload }, done);
              }}
            />
          </DialogContent>
        )}
      </Dialog>

      {receiptId && <ReceiptViewerDialog receiptId={receiptId} onClose={() => setReceiptId(null)} />}

      <ConfirmDialog
        open={toDelete !== null}
        title="Hapus transaksi?"
        description="Transaksi akan dihapus permanen dan saldo dompet dihitung ulang."
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
