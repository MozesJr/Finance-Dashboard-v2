import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatCompact } from '@/lib/money';
import { useTrend } from '../hooks';
import { shortMonthLabel } from '../months';
import { ChartTooltip } from './ChartTooltip';

export function TrendChart() {
  const { data, isLoading, error, refetch } = useTrend(6);
  const hasData = data?.months.some((m) => m.income !== '0' || m.expense !== '0');

  return (
    <Card>
      <h2 className="mb-4 font-semibold text-fg">Tren 6 bulan terakhir</h2>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || !hasData ? (
        <EmptyState message="Belum ada transaksi dalam 6 bulan terakhir." />
      ) : (
        <div className="h-64" role="img" aria-label="Grafik batang pemasukan dan pengeluaran per bulan">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months.map((m) => ({ label: shortMonthLabel(m.month), Pemasukan: Number(m.income), Pengeluaran: Number(m.expense) }))}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeOpacity={0.5} />
              <XAxis dataKey="label" tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                width={48}
                tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatCompact(BigInt(Math.round(v)))}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--surface-2))', fillOpacity: 0.5 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Pemasukan" fill="rgb(var(--income))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Pengeluaran" fill="rgb(var(--expense))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
