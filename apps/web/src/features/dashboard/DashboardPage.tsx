import { useState } from 'react';
import { getCurrentMonthJakarta } from 'shared';
import { ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/PageHeader';
import { getErrorMessage } from '@/lib/errors';
import { EmergencyWidget } from './components/EmergencyWidget';
import { CategoryBreakdown } from './components/CategoryBreakdown';
import { MonthPicker } from './components/MonthPicker';
import { SummaryCards, SummaryCardsSkeleton } from './components/SummaryCards';
import { TrendChart } from './components/TrendChart';
import { useSummary } from './hooks';

export function DashboardPage() {
  const [month, setMonth] = useState(getCurrentMonthJakarta);
  const { data, isLoading, error, refetch } = useSummary(month);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan arus kas bulanan."
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      {isLoading ? (
        <SummaryCardsSkeleton />
      ) : error || !data ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat ringkasan.')} onRetry={() => refetch()} />
      ) : (
        <SummaryCards data={data} />
      )}
      <EmergencyWidget />
      <div className="grid gap-6 xl:grid-cols-2">
        <CategoryBreakdown month={month} />
        <TrendChart />
      </div>
    </div>
  );
}
