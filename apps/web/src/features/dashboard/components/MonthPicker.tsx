import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentMonthJakarta, shiftMonth } from 'shared';
import { Button } from '@/components/ui/button';
import { fullMonthLabel } from '../months';

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const current = getCurrentMonthJakarta();
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Bulan sebelumnya" onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium text-fg">{fullMonthLabel(value)}</span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Bulan berikutnya"
        disabled={value >= current}
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
