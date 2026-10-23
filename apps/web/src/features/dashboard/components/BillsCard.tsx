import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useBillsOverview } from '@/features/bills/hooks';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Kartu dashboard: tagihan berkala terdekat, total cadangan, dan "uang bebas" (saldo dompet default − cadangan). */
export function BillsCard() {
  const { data } = useBillsOverview();
  if (!data || data.bills.length === 0) return null;
  const next = data.nextDue;
  const negative = data.freeMoney !== null && BigInt(data.freeMoney) < 0n;
  return (
    <Card data-testid="bills-card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Receipt className="h-4 w-4" /> Tagihan berkala
        </h2>
        <Link to="/tagihan" className="text-xs text-primary hover:underline">
          Lihat semua
        </Link>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Jatuh tempo terdekat</dt>
          <dd className="text-sm font-medium text-fg">{next ? `${next.name} ${formatMoney(next.amount)}` : '—'}</dd>
          {next && (
            <dd className={cn('text-xs', next.status === 'OVERDUE' ? 'text-expense' : next.status === 'DUE_SOON' ? 'text-warning' : 'text-muted')}>
              {next.nextDueDate} · {next.daysUntilDue < 0 ? `lewat ${-next.daysUntilDue} hari` : next.daysUntilDue === 0 ? 'hari ini' : `${next.daysUntilDue} hari lagi`}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted">Cadangan seharusnya</dt>
          <dd className="text-sm font-medium text-fg">{formatMoney(data.totalReserve)}</dd>
          <dd className="text-xs text-muted">{formatMoney(data.totalPerPeriod)} per periode</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Uang bebas{data.defaultWallet ? ` di ${data.defaultWallet.name}` : ''}</dt>
          <dd className={cn('text-sm font-medium', negative ? 'text-expense' : 'text-fg')}>{data.freeMoney === null ? '—' : formatMoney(data.freeMoney)}</dd>
          <dd className="text-xs text-muted">saldo − cadangan</dd>
        </div>
      </dl>
    </Card>
  );
}
