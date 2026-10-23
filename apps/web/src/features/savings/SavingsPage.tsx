import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/PageHeader';
import { usePeriodSelection } from '@/features/settings/hooks';
import { MonthPicker } from '@/features/dashboard/components/MonthPicker';
import { getErrorMessage } from '@/lib/errors';
import type { GoalDto } from './api';
import { AllocationCards, AllocationTable } from './components/AllocationOverview';
import { ContributionDialog } from './components/ContributionDialog';
import { ContributionHistoryDialog } from './components/ContributionHistoryDialog';
import { GoalCard } from './components/GoalCard';
import { PaydayBanner } from '@/features/payday/components/PaydayBanner';
import { useWallets } from '@/features/wallets/hooks';
import { investmentTotals } from '@/features/wallets/investment';
import { GoalFormDialog } from './components/GoalFormDialog';
import { PhaseToggle } from './components/PhaseToggle';
import { TemplateDialog } from './components/TemplateDialog';
import { useAllocationPlan, useAllocationReport, useGoals, useUpdateGoal } from './hooks';

type Dialog =
  | { kind: 'contribution'; goal: GoalDto; type: 'DEPOSIT' | 'WITHDRAW' }
  | { kind: 'history'; goal: GoalDto }
  | { kind: 'goal'; goal?: GoalDto; defaultType?: 'EMERGENCY' | 'INVESTMENT' | 'CUSTOM' }
  | { kind: 'template' }
  | null;

export function SavingsPage() {
  const [month, setMonth] = usePeriodSelection();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [requestedPhase, setRequestedPhase] = useState<number | null>(null);

  const plan = useAllocationPlan();
  const hasPlan = plan.data != null;
  const report = useAllocationReport(month, hasPlan);
  const goals = useGoals(showArchived);
  const { data: allWallets } = useWallets(false);
  const marketTotals = investmentTotals(allWallets ?? []);
  const updateGoal = useUpdateGoal();

  const emergency = goals.data?.find((g) => g.type === 'EMERGENCY' && !g.isArchived);
  const otherGoals = goals.data?.filter((g) => g !== emergency) ?? [];
  const close = () => setDialog(null);

  const toggleArchive = (goal: GoalDto) =>
    updateGoal.mutate(
      { id: goal.id, payload: { isArchived: !goal.isArchived } },
      {
        onSuccess: () => toast.success(goal.isArchived ? 'Goal diaktifkan kembali' : 'Goal diarsipkan'),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  const goalCard = (goal: GoalDto, emphasized = false) => (
    <GoalCard
      key={goal.id}
      goal={goal}
      emphasized={emphasized}
      market={goal.type === 'INVESTMENT' ? marketTotals : null}
      onDeposit={() => setDialog({ kind: 'contribution', goal, type: 'DEPOSIT' })}
      onWithdraw={() => setDialog({ kind: 'contribution', goal, type: 'WITHDRAW' })}
      onHistory={() => setDialog({ kind: 'history', goal })}
      onEdit={() => setDialog({ kind: 'goal', goal })}
      onToggleArchive={emphasized ? undefined : () => toggleArchive(goal)}
    />
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tabungan"
        subtitle="Goals tabungan dan alokasi gaji berfase."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker value={month} onChange={setMonth} />
            <Link
              to="/tabungan/alokasi"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm text-fg hover:bg-surface-2"
            >
              <Settings2 className="h-4 w-4" /> Atur alokasi
            </Link>
          </div>
        }
      />

      <PaydayBanner />

      {/* Alokasi gaji */}
      <section aria-labelledby="alokasi-heading" className="space-y-4">
        <h2 id="alokasi-heading" className="text-lg font-semibold text-fg">
          Alokasi Gaji
        </h2>
        {plan.isLoading ? (
          <Skeleton className="h-40" />
        ) : plan.error ? (
          <ErrorState message={getErrorMessage(plan.error, 'Gagal memuat alokasi.')} onRetry={() => plan.refetch()} />
        ) : !plan.data ? (
          <EmptyState
            message="Belum ada rencana alokasi gaji. Buat dari template untuk memulai."
            action={<Button onClick={() => setDialog({ kind: 'template' })}>Buat dari template</Button>}
          />
        ) : (
          <>
            <PhaseToggle
              activePhase={plan.data.activePhase}
              requestedPhase={requestedPhase}
              onRequestHandled={() => setRequestedPhase(null)}
            />
            {report.data?.suggestPhase2 && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-income/40 bg-income/10 p-4">
                <p className="flex items-center gap-2 text-sm text-fg">
                  <PartyPopper className="h-5 w-5 text-income" />
                  Dana darurat sudah tercapai. Saatnya beralih ke Fase 2 dan fokus investasi.
                </p>
                <Button size="sm" onClick={() => setRequestedPhase(2)}>
                  Pindah ke Fase 2
                </Button>
              </div>
            )}
            {report.isLoading ? (
              <Skeleton className="h-64" />
            ) : report.error || !report.data ? (
              <ErrorState message={getErrorMessage(report.error, 'Gagal memuat realisasi.')} onRetry={() => report.refetch()} />
            ) : (
              <>
                {!report.data.isCurrentMonth && (
                  <p className="text-xs text-muted">Menampilkan bulan yang sudah/belum berjalan. Rencana mengikuti fase aktif.</p>
                )}
                <AllocationCards items={report.data.items} />
                <AllocationTable report={report.data} />
              </>
            )}
          </>
        )}
      </section>

      {/* Dana darurat & goals */}
      <section aria-labelledby="goals-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="goals-heading" className="text-lg font-semibold text-fg">
            Goals Tabungan
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Tampilkan yang diarsipkan
            </label>
            <Button size="sm" onClick={() => setDialog({ kind: 'goal' })}>
              <Plus className="h-4 w-4" /> Tambah goal
            </Button>
          </div>
        </div>

        {goals.isLoading ? (
          <Skeleton className="h-48" />
        ) : goals.error ? (
          <ErrorState message={getErrorMessage(goals.error, 'Gagal memuat goals.')} onRetry={() => goals.refetch()} />
        ) : (
          <>
            {emergency ? (
              goalCard(emergency, true)
            ) : (
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Belum ada goal Dana Darurat aktif.</p>
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'goal', defaultType: 'EMERGENCY' })}>
                  Buat Dana Darurat
                </Button>
              </Card>
            )}
            {otherGoals.length === 0 ? (
              <EmptyState message="Belum ada goal lain (investasi atau tujuan khusus)." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">{otherGoals.map((g) => goalCard(g))}</div>
            )}
          </>
        )}
      </section>

      {dialog?.kind === 'contribution' && <ContributionDialog goal={dialog.goal} type={dialog.type} onClose={close} />}
      {dialog?.kind === 'history' && <ContributionHistoryDialog goal={dialog.goal} onClose={close} />}
      {dialog?.kind === 'goal' && <GoalFormDialog goal={dialog.goal} defaultType={dialog.defaultType} onClose={close} />}
      {dialog?.kind === 'template' && <TemplateDialog onClose={close} />}
    </div>
  );
}
