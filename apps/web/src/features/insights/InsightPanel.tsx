import { Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { fullMonthLabel } from '@/features/dashboard/months';
import { getErrorMessage } from '@/lib/errors';
import { useInsight, useRefreshInsight } from './hooks';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/** Insight & saran AI bulanan (cache; "Perbarui" memakai kuota harian). */
export function InsightPanel({ month }: { month: string }) {
  const { data: insight, isLoading, error, refetch } = useInsight(month);
  const refresh = useRefreshInsight(month);

  const run = () =>
    refresh.mutate(undefined, {
      onSuccess: () => toast.success('Insight diperbarui'),
      onError: (e) => toast.error(getErrorMessage(e, 'Insight gagal dibuat.')),
    });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-fg">
          <Sparkles className="h-4 w-4 text-primary" />
          Insight AI · {fullMonthLabel(month)}
          {insight?.provisional && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-normal text-warning">sementara</span>
          )}
        </h2>
        {insight && (
          <Button size="sm" variant="outline" onClick={run} disabled={refresh.isPending}>
            <RefreshCw className={refresh.isPending ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
            {refresh.isPending ? 'Memperbarui…' : 'Perbarui'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : error ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat insight.')} onRetry={() => refetch()} />
      ) : !insight ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Belum ada insight untuk bulan ini. AI akan merangkum pengeluaranmu dan memberi saran konkret.</p>
          <Button onClick={run} disabled={refresh.isPending}>
            {refresh.isPending ? 'Membuat insight…' : 'Buat insight'}
          </Button>
          {refresh.isPending && <p className="text-xs text-muted">Biasanya 10–20 detik.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg">{insight.narrative.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Temuan</h3>
              <ul className="space-y-2 text-sm text-fg">
                {insight.narrative.findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted">{i + 1}.</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <Lightbulb className="h-3 w-3" /> Saran
              </h3>
              <ul className="space-y-2 text-sm text-fg">
                {insight.narrative.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted">
            Dibuat {formatTime(insight.generatedAt)}
            {insight.source === 'TEMPLATE' && ' · Ringkasan otomatis (tanpa AI)'}
            {insight.provisional && ' · Data bulan berjalan belum final'}
          </p>
        </div>
      )}
    </Card>
  );
}
