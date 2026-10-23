import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentMonthJakarta, getPeriodRange, shiftMonth, toDateString } from 'shared';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/features/settings/hooks';
import { fullMonthLabel, shortRangeLabel } from '../months';

/**
 * Pemilih periode keuangan. Nilai = kunci periode (YYYY-MM, bulan tempat periode berakhir).
 * Tanggal mulai 1 menampilkan nama bulan; selain itu ditambah rentang tanggal periodenya.
 */
export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const { data } = useSettings();
  const startDay = data?.periodStartDay ?? 1;
  const current = data?.currentPeriod.key ?? getCurrentMonthJakarta();
  const range = startDay > 1 ? shortRangeLabel(toDateString(getPeriodRange(value, startDay).start), toDateString(new Date(getPeriodRange(value, startDay).endExclusive.getTime() - 86_400_000))) : null;
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Periode sebelumnya" onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-36 text-center">
        <p className="text-sm font-medium text-fg" data-testid="period-name">{fullMonthLabel(value)}</p>
        {range && <p className="text-xs text-muted" data-testid="period-range">{range}</p>}
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Periode berikutnya"
        disabled={value >= current}
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
