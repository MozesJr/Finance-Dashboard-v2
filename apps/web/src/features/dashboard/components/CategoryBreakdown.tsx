import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryType } from 'shared';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useByCategory } from '../hooks';
import { ChartTooltip } from './ChartTooltip';

const TABS: Array<{ type: CategoryType; label: string }> = [
  { type: 'EXPENSE', label: 'Pengeluaran' },
  { type: 'INCOME', label: 'Pemasukan' },
];

const FALLBACK_FILL = 'rgb(var(--muted))';

export function CategoryBreakdown({ month }: { month: string }) {
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const { data, isLoading, error, refetch } = useByCategory(month, type);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-fg">Per kategori</h2>
        <div role="tablist" className="inline-flex rounded-md border border-line p-0.5">
          {TABS.map((t) => (
            <button
              key={t.type}
              role="tab"
              aria-selected={type === t.type}
              onClick={() => setType(t.type)}
              className={cn(
                'rounded px-3 py-1 text-xs transition-colors',
                type === t.type ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState message={`Belum ada ${type === 'EXPENSE' ? 'pengeluaran' : 'pemasukan'} di bulan ini.`} />
      ) : (
        <div className="grid items-center gap-4 md:grid-cols-2">
          <div className="h-56" role="img" aria-label="Diagram donat per kategori">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.items.map((i) => ({ name: i.name, value: Number(i.total) }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="90%"
                  stroke="none"
                >
                  {data.items.map((item) => (
                    <Cell key={item.categoryId ?? 'none'} fill={item.color ?? FALLBACK_FILL} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li key={item.categoryId ?? 'none'}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-fg">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color ?? FALLBACK_FILL }} />
                    <span className="truncate">
                      {item.icon} {item.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-fg">{formatMoney(item.total)}</span>
                </div>
                <p className="ml-4 text-xs text-muted">
                  {item.percent.toLocaleString('id-ID')}% · {item.count} transaksi
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
