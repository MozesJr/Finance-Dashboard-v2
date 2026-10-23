import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { useWallets } from '@/features/wallets/hooks';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import type { ChecklistDto, ChecklistItemDto } from '../api';
import { usePayday, useRunPaydayAction } from '../hooks';

const ACTION_LABEL: Record<ChecklistItemDto['kind'], string> = {
  SAVING: 'Setor',
  EXPENSE_SINGLE: 'Catat',
  EXPENSE_INFO: '',
  INCOME: 'Perbarui gaji',
  BILL: 'Bayar',
};

function Row({ c, item }: { c: ChecklistDto; item: ChecklistItemDto }) {
  const run = useRunPaydayAction();
  const { data: wallets } = useWallets(false);
  const [destination, setDestination] = useState('');
  const options = (wallets ?? []).filter((w) => w.id !== c.salary.walletId);

  const label = item.icon ? `${item.icon} ${item.name}` : item.name;
  const amountText =
    item.kind === 'INCOME'
      ? `alokasi ${formatMoney(item.planIncome ?? '0')} → gaji diterima ${formatMoney(item.amount)}`
      : item.kind === 'EXPENSE_INFO'
        ? `anggaran ${formatMoney(item.amount)} (beberapa kategori)`
        : item.kind === 'BILL'
          ? `${formatMoney(item.amount)} · jatuh tempo ${item.dueDate ?? ''}`
          : formatMoney(item.amount);

  const submit = () =>
    run.mutate(
      { itemKey: item.key, periodKey: c.period.key, destinationWalletId: item.needsDestination ? destination : null },
      {
        onSuccess: (r) => toast.success(r.message),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="payday-item">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-fg">{label}</p>
        <p className="text-xs text-muted">{amountText}</p>
      </div>
      {item.kind === 'EXPENSE_INFO' ? null : item.done ? (
        <span className="inline-flex items-center gap-1 text-xs text-income">
          <CheckCircle2 className="h-4 w-4" /> Sudah
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {item.needsDestination && (
            <Select aria-label={`Dompet tujuan ${item.name}`} value={destination} onChange={(e) => setDestination(e.target.value)} className="h-9 w-44">
              <option value="">Pilih dompet tujuan…</option>
              {options.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
          <Button size="sm" onClick={submit} disabled={run.isPending || (item.needsDestination === true && destination === '')}>
            {ACTION_LABEL[item.kind]}
          </Button>
        </div>
      )}
    </li>
  );
}

/** Banner Tabungan: gaji periode ini sudah masuk → selesaikan alokasi (aksi sama dengan checklist di bot). */
export function PaydayBanner() {
  const { data } = usePayday();
  const c = data?.checklist;
  if (!c || (!c.hasPlan && c.items.length === 0)) return null;
  const actionable = c.items.filter((i) => i.kind !== 'EXPENSE_INFO');
  if (actionable.length === 0) return null;
  const allDone = actionable.every((i) => i.done);

  if (allDone) {
    return (
      <Card className="flex items-center gap-2 border-income/40 p-3 text-sm text-income" data-testid="payday-done">
        <CheckCircle2 className="h-4 w-4" /> Alokasi gaji periode {c.period.label} sudah selesai.
      </Card>
    );
  }

  return (
    <Card className="border-accent-darurat/50" data-testid="payday-banner">
      <h2 className="text-base font-semibold text-fg">Gaji periode ini sudah masuk — selesaikan alokasi</h2>
      <p className="mt-1 text-sm text-muted">
        {formatMoney(c.salary.amount)} masuk ke {c.salary.walletName} · {c.period.label}
      </p>
      <ul className="mt-2 divide-y divide-line/60">
        {c.items.map((item) => (
          <Row key={item.key} c={c} item={item} />
        ))}
      </ul>
    </Card>
  );
}
