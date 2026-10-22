import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ProgressBar } from '@/features/savings/components/ProgressBar';
import { useGoals } from '@/features/savings/hooks';
import { formatMoney } from '@/lib/money';

/** Widget kecil progres Dana Darurat dengan tautan ke halaman Tabungan. */
export function EmergencyWidget() {
  const { data, isLoading, error, refetch } = useGoals(false);
  const goal = data?.find((g) => g.type === 'EMERGENCY');

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-fg">🛟 Dana Darurat</h2>
        <Link to="/tabungan" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Lihat Tabungan <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !goal ? (
        <p className="text-sm text-muted">
          Belum ada goal Dana Darurat.{' '}
          <Link to="/tabungan" className="text-primary hover:underline">
            Mulai dari halaman Tabungan
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-1">
            <p className="text-xl font-bold text-fg">{formatMoney(goal.collected)}</p>
            <p className="text-xs text-muted">{goal.target !== null ? `dari ${formatMoney(goal.target)}` : 'Belum ada target'}</p>
          </div>
          {goal.target !== null && (
            <ProgressBar value={goal.percent ?? 0} barClass={(goal.percent ?? 0) >= 100 ? 'bg-income' : 'bg-primary'} label="Progres dana darurat" />
          )}
          <p className="text-xs text-muted">
            {goal.percent === null ? goal.targetNote : `${goal.percent.toLocaleString('id-ID')}% tercapai`}
          </p>
        </div>
      )}
    </Card>
  );
}
