import { useState } from 'react';
import { History, Pencil, Plus, Power, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/PageHeader';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { BillDto } from './api';
import { BillForm } from './components/BillForm';
import { PayBillDialog } from './components/PayBillDialog';
import { useBillPayments, useBills, useBillsOverview, useCreateBill, useUpdateBill } from './hooks';

const STATUS_TEXT: Record<BillDto['status'], string> = { OVERDUE: 'Lewat jatuh tempo', DUE_SOON: 'Segera jatuh tempo', OK: 'Aman', INACTIVE: 'Nonaktif' };
const STATUS_CLASS: Record<BillDto['status'], string> = { OVERDUE: 'text-expense', DUE_SOON: 'text-warning', OK: 'text-income', INACTIVE: 'text-muted' };

const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function dueText(b: BillDto): string {
  if (b.daysUntilDue < 0) return `${formatDate(b.nextDueDate)} · lewat ${-b.daysUntilDue} hari`;
  if (b.daysUntilDue === 0) return `${formatDate(b.nextDueDate)} · hari ini`;
  return `${formatDate(b.nextDueDate)} · ${b.daysUntilDue} hari lagi`;
}

function HistoryList({ billId }: { billId: string }) {
  const { data, isLoading } = useBillPayments(billId);
  if (isLoading) return <p className="text-sm text-muted">Memuat…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted">Belum ada pembayaran.</p>;
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
      {data.map((p) => (
        <li key={p.id} className="flex justify-between gap-2">
          <span className="text-muted">
            Dibayar {formatDate(p.paidOn)} <span className="text-xs">(untuk jatuh tempo {formatDate(p.dueDate)})</span>
          </span>
          <span className="font-medium text-fg">{formatMoney(p.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

type Dialog_ = { kind: 'form'; bill?: BillDto } | { kind: 'pay'; bill: BillDto } | { kind: 'history'; bill: BillDto } | null;

export function BillsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<Dialog_>(null);
  const bills = useBills(showInactive);
  const overview = useBillsOverview();
  const create = useCreateBill();
  const update = useUpdateBill();
  const close = () => {
    setDialog(null);
    create.reset();
    update.reset();
  };

  const toggleActive = (b: BillDto) =>
    update.mutate(
      { id: b.id, payload: { isActive: !b.isActive } },
      { onSuccess: () => toast.success(b.isActive ? 'Tagihan dinonaktifkan' : 'Tagihan diaktifkan'), onError: (e) => toast.error(getErrorMessage(e)) },
    );

  const o = overview.data;
  return (
    <div>
      <PageHeader
        title="Tagihan"
        subtitle="Tagihan berkala, pengingat, dan cadangan yang perlu disisihkan."
        actions={
          <Button onClick={() => setDialog({ kind: 'form' })}>
            <Plus className="h-4 w-4" /> Tambah tagihan
          </Button>
        }
      />

      {o && o.bills.length > 0 && (
        <Card className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="bills-summary">
          <div>
            <p className="text-xs text-muted">Cadangan seharusnya</p>
            <p className="text-xl font-bold text-fg">{formatMoney(o.totalReserve)}</p>
            <p className="text-xs text-muted">sisihkan {formatMoney(o.totalPerPeriod)} per periode</p>
          </div>
          <div>
            <p className="text-xs text-muted">Uang bebas{o.defaultWallet ? ` di ${o.defaultWallet.name}` : ''}</p>
            <p className={cn('text-xl font-bold', o.freeMoney !== null && BigInt(o.freeMoney) < 0n ? 'text-expense' : 'text-fg')}>
              {o.freeMoney === null ? '—' : formatMoney(o.freeMoney)}
            </p>
            <p className="text-xs text-muted">saldo dompet default − cadangan</p>
          </div>
          <div>
            <p className="text-xs text-muted">Jatuh tempo terdekat</p>
            <p className="text-xl font-bold text-fg">{o.nextDue ? o.nextDue.name : '—'}</p>
            <p className="text-xs text-muted">{o.nextDue ? dueText(o.nextDue) : 'Belum ada tagihan'}</p>
          </div>
        </Card>
      )}

      <label className="mb-4 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Tampilkan yang nonaktif
      </label>

      {bills.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : bills.error ? (
        <ErrorState message={getErrorMessage(bills.error, 'Gagal memuat tagihan.')} onRetry={() => bills.refetch()} />
      ) : !bills.data || bills.data.length === 0 ? (
        <EmptyState message="Belum ada tagihan berkala. Tambahkan kos, asuransi, atau tagihan rutin lainnya." action={<Button onClick={() => setDialog({ kind: 'form' })}>Tambah tagihan</Button>} />
      ) : (
        <ul className="space-y-3">
          {bills.data.map((b) => (
            <li key={b.id}>
              <Card className={cn('flex flex-col gap-3', !b.isActive && 'opacity-60')} data-testid="bill-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-fg">
                      <Receipt className="h-4 w-4 text-muted" /> {b.name}
                    </p>
                    <p className="text-xs text-muted">
                      {b.categoryName ?? 'Tanpa kategori'} · {b.intervalMonths === 1 ? 'bulanan' : b.intervalMonths === 12 ? 'tahunan' : `tiap ${b.intervalMonths} bulan`}
                      {b.walletName ? ` · ${b.walletName}` : ''}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-fg">{formatMoney(b.amount)}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className={STATUS_CLASS[b.status]}>
                    {STATUS_TEXT[b.status]} · {dueText(b)}
                  </span>
                  <span className="text-xs text-muted">
                    Cadangan {formatMoney(b.accumulated)} · {formatMoney(b.reservePerPeriod)}/periode
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {b.isActive && (
                    <Button size="sm" onClick={() => setDialog({ kind: 'pay', bill: b })}>
                      Bayar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'form', bill: b })}>
                    <Pencil className="h-3 w-3" /> Ubah
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'history', bill: b })}>
                    <History className="h-3 w-3" /> Riwayat
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(b)} disabled={update.isPending}>
                    <Power className="h-3 w-3" /> {b.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        {dialog?.kind === 'form' && (
          <DialogContent title={dialog.bill ? 'Ubah tagihan' : 'Tambah tagihan'}>
            <BillForm
              bill={dialog.bill}
              submitting={create.isPending || update.isPending}
              error={dialog.bill ? update.error : create.error}
              onCancel={close}
              onSubmit={(payload) => {
                const done = { onSuccess: () => { toast.success('Tagihan disimpan'); close(); } };
                if (dialog.bill) update.mutate({ id: dialog.bill.id, payload }, done);
                else create.mutate(payload, done);
              }}
            />
          </DialogContent>
        )}
        {dialog?.kind === 'pay' && (
          <DialogContent title={`Bayar ${dialog.bill.name}`}>
            <PayBillDialog bill={dialog.bill} onClose={close} />
          </DialogContent>
        )}
        {dialog?.kind === 'history' && (
          <DialogContent title={`Riwayat ${dialog.bill.name}`}>
            <HistoryList billId={dialog.bill.id} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
