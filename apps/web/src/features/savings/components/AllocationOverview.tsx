import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ReportDto, ReportItemDto } from '../api';
import { STATUS_BAR, STATUS_LABEL, STATUS_TEXT } from '../status';
import { ProgressBar } from './ProgressBar';

function signedMoney(value: string): string {
  const n = BigInt(value);
  return `${n > 0n ? '+' : ''}${formatMoney(n)}`;
}

/** Selisih: untuk pengeluaran positif = melebihi rencana (merah); untuk tabungan positif = melampaui (hijau). */
function diffClass(item: ReportItemDto): string {
  const n = BigInt(item.diff);
  if (n === 0n) return 'text-muted';
  if (item.kind === 'EXPENSE') return n > 0n ? 'text-expense' : 'text-income';
  return n > 0n ? 'text-income' : 'text-warning';
}

export function AllocationCards({ items }: { items: ReportItemDto[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3" style={item.color ? { borderTopColor: item.color, borderTopWidth: 3 } : undefined}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">
                {item.icon} {item.name}
              </p>
              <p className="text-xs text-muted">{item.kind === 'SAVING' ? 'Tabungan' : 'Pengeluaran'}</p>
            </div>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg">{item.percent}%</span>
          </div>

          {item.dialihkan ? (
            <p className="rounded-md bg-surface-2 px-3 py-4 text-center text-sm text-muted">Selesai — dialihkan</p>
          ) : (
            <>
              <div>
                <p className="text-xs text-muted">Rencana bulan ini</p>
                <p className="text-xl font-bold text-fg">{formatMoney(item.planned)}</p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">{item.kind === 'SAVING' ? 'Disetor' : 'Terpakai'}: <span className="text-fg">{formatMoney(item.realized)}</span></span>
                  <span className={STATUS_TEXT[item.status]}>{STATUS_LABEL[item.status]}</span>
                </div>
                <ProgressBar value={item.usedPercent ?? 0} barClass={STATUS_BAR[item.status]} label={`Realisasi ${item.name}`} />
                <p className="mt-1 text-xs text-muted">
                  Sisa {formatMoney(item.remaining)}
                  {item.usedPercent !== null && ` · ${item.usedPercent.toLocaleString('id-ID')}%`}
                </p>
              </div>
            </>
          )}
          {item.description && <p className="text-xs text-muted">{item.description}</p>}
        </Card>
      ))}
    </div>
  );
}

export function AllocationTable({ report }: { report: ReportDto }) {
  const { items, totals } = report;
  return (
    <>
      {/* Desktop */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Pos</th>
              <th className="px-4 py-3 text-right font-medium">Porsi</th>
              <th className="px-4 py-3 text-right font-medium">Nominal</th>
              <th className="px-4 py-3 text-right font-medium">Realisasi</th>
              <th className="px-4 py-3 text-right font-medium">Sisa</th>
              <th className="px-4 py-3 text-right font-medium">Selisih</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-line/50">
                <td className="px-4 py-3 text-fg">
                  {item.icon} {item.name}
                </td>
                <td className="px-4 py-3 text-right text-muted">{item.percent}%</td>
                <td className="px-4 py-3 text-right text-fg">{formatMoney(item.planned)}</td>
                <td className="px-4 py-3 text-right text-fg">{formatMoney(item.realized)}</td>
                <td className="px-4 py-3 text-right text-muted">{formatMoney(item.remaining)}</td>
                <td className={cn('px-4 py-3 text-right', diffClass(item))}>{signedMoney(item.diff)}</td>
                <td className={cn('px-4 py-3', STATUS_TEXT[item.status])}>{item.dialihkan ? 'Dialihkan' : STATUS_LABEL[item.status]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-4 py-3 text-fg">Total</td>
              <td className="px-4 py-3 text-right text-muted">100%</td>
              <td className="px-4 py-3 text-right text-fg">{formatMoney(totals.planned)}</td>
              <td className="px-4 py-3 text-right text-fg">{formatMoney(totals.realized)}</td>
              <td className="px-4 py-3 text-right text-muted">{formatMoney(totals.remaining)}</td>
              <td className="px-4 py-3 text-right text-muted">{signedMoney(totals.diff)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Mobile */}
      <ul className="space-y-2 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-fg">
                  {item.icon} {item.name} <span className="text-muted">· {item.percent}%</span>
                </p>
                <span className={cn('shrink-0 text-xs', STATUS_TEXT[item.status])}>
                  {item.dialihkan ? 'Dialihkan' : STATUS_LABEL[item.status]}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Nominal</dt>
                <dd className="text-right text-fg">{formatMoney(item.planned)}</dd>
                <dt className="text-muted">Realisasi</dt>
                <dd className="text-right text-fg">{formatMoney(item.realized)}</dd>
                <dt className="text-muted">Sisa</dt>
                <dd className="text-right text-fg">{formatMoney(item.remaining)}</dd>
                <dt className="text-muted">Selisih</dt>
                <dd className={cn('text-right', diffClass(item))}>{signedMoney(item.diff)}</dd>
              </dl>
            </Card>
          </li>
        ))}
        <li>
          <Card className="space-y-1 border-primary/40 p-3">
            <p className="text-sm font-semibold text-fg">Total</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">Nominal</dt>
              <dd className="text-right text-fg">{formatMoney(totals.planned)}</dd>
              <dt className="text-muted">Realisasi</dt>
              <dd className="text-right text-fg">{formatMoney(totals.realized)}</dd>
              <dt className="text-muted">Sisa</dt>
              <dd className="text-right text-fg">{formatMoney(totals.remaining)}</dd>
              <dt className="text-muted">Selisih</dt>
              <dd className="text-right text-muted">{signedMoney(totals.diff)}</dd>
            </dl>
          </Card>
        </li>
      </ul>
    </>
  );
}
