import { formatMoney } from '@/lib/money';

interface Entry {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
}

/** Tooltip Recharts dalam Rupiah. */
export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Entry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium text-fg">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.name)} className="text-muted">
          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? p.payload?.fill }} />
          {p.name}: <span className="text-fg">{formatMoney(BigInt(Math.round(Number(p.value ?? 0))))}</span>
        </p>
      ))}
    </div>
  );
}
