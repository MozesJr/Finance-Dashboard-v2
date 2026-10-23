import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { SummaryDto } from '../api';
import { shortMonthLabel } from '../months';

/** goodWhenUp: pemasukan/selisih naik = baik; pengeluaran naik = buruk. */
function ChangeBadge({ value, goodWhenUp, previousLabel }: { value: number | null; goodWhenUp: boolean; previousLabel: string }) {
  if (value === null) return <p className="mt-1 text-xs text-muted">Tidak ada data {previousLabel}</p>;
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : up === goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={cn('mt-1 flex items-center gap-1 text-xs', good === null ? 'text-muted' : good ? 'text-income' : 'text-expense')}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toLocaleString('id-ID')}% vs {previousLabel}
    </p>
  );
}

export function SummaryCards({ data }: { data: SummaryDto }) {
  const netNegative = BigInt(data.net) < 0n;
  const custom = data.period.label.includes('(');
  const previousLabel = custom ? 'periode lalu' : shortMonthLabel(data.previousMonth);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <p className="text-xs text-muted">Pemasukan</p>
        <p className="mt-1 text-2xl font-bold text-income">{formatMoney(data.totalIncome)}</p>
        <ChangeBadge value={data.change.income} goodWhenUp previousLabel={previousLabel} />
      </Card>
      <Card>
        <p className="text-xs text-muted">Pengeluaran</p>
        <p className="mt-1 text-2xl font-bold text-expense">{formatMoney(data.totalExpense)}</p>
        <ChangeBadge value={data.change.expense} goodWhenUp={false} previousLabel={previousLabel} />
      </Card>
      <Card>
        <p className="text-xs text-muted">{custom ? 'Selisih periode ini' : 'Selisih bulan ini'}</p>
        <p className={cn('mt-1 text-2xl font-bold', netNegative ? 'text-expense' : 'text-fg')}>{formatMoney(data.net)}</p>
        <ChangeBadge value={data.change.net} goodWhenUp previousLabel={previousLabel} />
      </Card>
      <Card>
        <p className="text-xs text-muted">Total saldo (semua dompet aktif)</p>
        <p className="mt-1 text-2xl font-bold text-fg">{formatMoney(data.totalBalance)}</p>
      </Card>
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}
