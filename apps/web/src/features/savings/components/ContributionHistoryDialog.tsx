import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ContributionDto, GoalDto } from '../api';
import { useContributions, useDeleteContribution } from '../hooks';

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function ContributionHistoryDialog({ goal, onClose }: { goal: GoalDto; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useContributions(goal.id);
  const remove = useDeleteContribution();
  const [toDelete, setToDelete] = useState<ContributionDto | null>(null);

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => toast.success('Kontribusi dihapus'),
      onError: (e) => toast.error(getErrorMessage(e)),
      onSettled: () => setToDelete(null),
    });
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent title={`Riwayat ${goal.name}`} description="Setoran dan penarikan, terbaru di atas." className="max-w-lg">
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : error ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState message="Belum ada kontribusi." />
          ) : (
            <ul className="space-y-2">
              {data.map((c) => {
                const deposit = c.type === 'DEPOSIT';
                const Icon = deposit ? ArrowDownCircle : ArrowUpCircle;
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                    <Icon className={cn('h-5 w-5 shrink-0', deposit ? 'text-income' : 'text-expense')} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-semibold', deposit ? 'text-income' : 'text-expense')}>
                        {deposit ? '+' : '-'}
                        {formatMoney(c.amount)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDate(c.date)}
                        {c.note ? ` · ${c.note}` : ''}
                        {c.transactionId ? ' · transfer tercatat' : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Hapus kontribusi" onClick={() => setToDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        title="Hapus kontribusi?"
        description="Kontribusi dihapus beserta transfer antar dompet yang terhubung. Penghapusan ditolak jika membuat saldo goal minus."
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
