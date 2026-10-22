import { Archive, ArchiveRestore, ArrowDownCircle, ArrowUpCircle, History, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { GoalDto } from '../api';
import { ProgressBar } from './ProgressBar';

interface Props {
  goal: GoalDto;
  emphasized?: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onToggleArchive?: () => void;
}

function targetBasis(goal: GoalDto): string | null {
  if (goal.targetMode !== 'MONTHS_OF_EXPENSE') return null;
  if (!goal.avgMonthlyExpense) return null;
  return `${goal.targetMonths ?? 6} bulan × rata-rata pengeluaran ${formatMoney(goal.avgMonthlyExpense)} (dari ${goal.basisMonths} bulan data)`;
}

function estimate(goal: GoalDto): string {
  if (goal.remaining === null) return '—';
  if (goal.remaining === '0') return 'Tercapai';
  if (goal.estimatedMonths === null) return 'Belum bisa diperkirakan';
  return `± ${goal.estimatedMonths} bulan lagi`;
}

export function GoalCard({ goal, emphasized, onDeposit, onWithdraw, onHistory, onEdit, onToggleArchive }: Props) {
  const percent = goal.percent ?? 0;
  const done = goal.percent !== null && goal.percent >= 100;
  const basis = targetBasis(goal);

  return (
    <Card className={cn('flex flex-col gap-3', emphasized && 'border-accent-darurat/50', goal.isArchived && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg"
            style={goal.color ? { backgroundColor: goal.color } : undefined}
          >
            {goal.icon ?? '🎯'}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{goal.name}</p>
            <p className="truncate text-xs text-muted">
              {goal.wallet ? `Disimpan di ${goal.wallet.name}` : 'Tanpa dompet penyimpanan'}
              {goal.isArchived && ' · Diarsipkan'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon" aria-label={`Ubah ${goal.name}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          {onToggleArchive && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={goal.isArchived ? `Aktifkan ${goal.name}` : `Arsipkan ${goal.name}`}
              onClick={onToggleArchive}
            >
              {goal.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-end justify-between gap-1">
          <p className="text-2xl font-bold text-fg">{formatMoney(goal.collected)}</p>
          <p className="text-sm text-muted">
            {goal.target !== null ? `dari ${formatMoney(goal.target)}` : 'Belum ada target'}
          </p>
        </div>
        {goal.target !== null && (
          <ProgressBar value={percent} barClass={done ? 'bg-income' : 'bg-primary'} label={`Progres ${goal.name}`} />
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Progres</dt>
          <dd className="font-medium text-fg">{goal.percent === null ? '—' : `${goal.percent.toLocaleString('id-ID')}%`}</dd>
        </div>
        <div>
          <dt className="text-muted">Sisa</dt>
          <dd className="font-medium text-fg">{goal.remaining === null ? '—' : formatMoney(goal.remaining)}</dd>
        </div>
        <div>
          <dt className="text-muted">Estimasi</dt>
          <dd className="font-medium text-fg">{estimate(goal)}</dd>
        </div>
      </dl>

      {basis && <p className="text-xs text-muted">Target: {basis}</p>}
      {goal.targetNote && <p className="text-xs text-warning">{goal.targetNote}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onDeposit} disabled={goal.isArchived}>
          <ArrowDownCircle className="h-4 w-4" /> Setor
        </Button>
        <Button size="sm" variant="secondary" onClick={onWithdraw} disabled={goal.isArchived}>
          <ArrowUpCircle className="h-4 w-4" /> Tarik
        </Button>
        <Button size="sm" variant="ghost" onClick={onHistory}>
          <History className="h-4 w-4" /> Riwayat
        </Button>
      </div>
    </Card>
  );
}
