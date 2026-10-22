import { cn } from '@/lib/utils';

/** Bar progres; value dalam persen (boleh > 100, bar dipotong di 100). */
export function ProgressBar({ value, barClass, label }: { value: number; barClass: string; label: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${width}%` }} />
    </div>
  );
}
