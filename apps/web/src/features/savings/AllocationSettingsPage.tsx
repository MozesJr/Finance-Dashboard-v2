import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MoneyInputSchema, PutPhaseItemsSchema } from 'shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/PageHeader';
import { useCategories } from '@/features/categories/hooks';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { PlanDto, PlanItemDto } from './api';
import { TemplateDialog } from './components/TemplateDialog';
import { useAllocationPlan, useGoals, usePutPhaseItems, useUpdatePlan } from './hooks';
import { PHASE_LABEL } from './status';

interface Row {
  key: string;
  name: string;
  description: string;
  kind: 'EXPENSE' | 'SAVING';
  percent: string;
  color: string;
  icon: string;
  categoryIds: string[];
  goalId: string;
}

let rowSeq = 0;
const newKey = () => `row-${rowSeq++}`;

const toRow = (item: PlanItemDto): Row => ({
  key: item.id,
  name: item.name,
  description: item.description ?? '',
  kind: item.kind,
  percent: String(item.percent),
  color: item.color ?? '#38bdf8',
  icon: item.icon ?? '',
  categoryIds: item.categoryIds,
  goalId: item.goalId ?? '',
});

const percentValue = (row: Row) => (row.percent.trim() === '' ? 0 : Number(row.percent));

function IncomeCard({ plan }: { plan: PlanDto }) {
  const [value, setValue] = useState(plan.monthlyIncome);
  const [error, setError] = useState<string>();
  const update = useUpdatePlan();

  const save = () => {
    const parsed = MoneyInputSchema.safeParse(value);
    if (!parsed.success || parsed.data <= 0n) {
      setError(parsed.success ? 'Gaji harus lebih dari 0' : parsed.error.issues[0].message);
      return;
    }
    setError(undefined);
    update.mutate(
      { monthlyIncome: parsed.data.toString() },
      {
        onSuccess: () => {
          toast.success('Gaji bulanan diperbarui');
          setValue(parsed.data.toString());
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

  return (
    <Card>
      <Label htmlFor="income">Gaji bulanan</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="income" className="max-w-xs" value={value} onChange={(e) => setValue(e.target.value)} placeholder="mis. 10jt" />
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Menyimpan…' : 'Simpan gaji'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">Saat ini {formatMoney(plan.monthlyIncome)}. Nominal tiap pos dihitung dari gaji ini.</p>
      <FieldError message={error} />
    </Card>
  );
}

function PhaseEditor({ plan, phase }: { plan: PlanDto; phase: 1 | 2 }) {
  const serverRows = useMemo(() => plan.phases[phase].map(toRow), [plan, phase]);
  const [draft, setDraft] = useState<Row[] | null>(null);
  const rows = draft ?? serverRows;
  const dirty = draft !== null;

  const { data: categories } = useCategories('EXPENSE');
  const { data: goals } = useGoals(false);
  const save = usePutPhaseItems();
  const [error, setError] = useState<string>();

  const total = rows.reduce((acc, r) => acc + (Number.isFinite(percentValue(r)) ? percentValue(r) : 0), 0);
  const edit = (next: Row[]) => {
    setDraft(next);
    setError(undefined);
  };
  const patch = (key: string, change: Partial<Row>) => edit(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const categoryOwner = (categoryId: string, exceptKey: string) =>
    rows.find((r) => r.key !== exceptKey && r.kind === 'EXPENSE' && r.categoryIds.includes(categoryId))?.name;

  const submit = () => {
    const payload = rows.map((r) => ({
      name: r.name,
      description: r.description.trim() || null,
      kind: r.kind,
      percent: percentValue(r),
      color: r.color,
      icon: r.icon.trim() || null,
      categoryIds: r.kind === 'EXPENSE' ? r.categoryIds : [],
      goalId: r.kind === 'SAVING' ? r.goalId || null : null,
    }));
    const parsed = PutPhaseItemsSchema.safeParse({ items: payload });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const rowIndex = typeof issue.path[1] === 'number' ? issue.path[1] : null;
      setError(rowIndex !== null ? `Pos ${rowIndex + 1}: ${issue.message}` : issue.message);
      return;
    }
    save.mutate(
      { phase, items: payload },
      {
        onSuccess: () => {
          toast.success(`${PHASE_LABEL[phase]} disimpan`);
          setDraft(null);
        },
        onError: (e) => setError(getErrorMessage(e)),
      },
    );
  };

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <Card key={row.key} className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted">Pos {index + 1}</p>
            <Button variant="ghost" size="icon" aria-label={`Hapus pos ${row.name || index + 1}`} onClick={() => edit(rows.filter((r) => r.key !== row.key))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <Label htmlFor={`name-${row.key}`}>Nama pos</Label>
              <Input id={`name-${row.key}`} value={row.name} maxLength={60} onChange={(e) => patch(row.key, { name: e.target.value })} />
            </div>
            <div className="sm:w-32">
              <Label htmlFor={`kind-${row.key}`}>Jenis</Label>
              <Select id={`kind-${row.key}`} value={row.kind} onChange={(e) => patch(row.key, { kind: e.target.value as Row['kind'] })}>
                <option value="EXPENSE">Pengeluaran</option>
                <option value="SAVING">Tabungan</option>
              </Select>
            </div>
            <div className="sm:w-24">
              <Label htmlFor={`pct-${row.key}`}>Persen</Label>
              <Input
                id={`pct-${row.key}`}
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                value={row.percent}
                onChange={(e) => patch(row.key, { percent: e.target.value })}
              />
            </div>
          </div>

          {row.kind === 'EXPENSE' ? (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm text-fg">
                Kategori terhubung ({row.categoryIds.length})
              </summary>
              <ul className="grid gap-1 border-t border-line p-3 sm:grid-cols-2">
                {categories?.map((c) => {
                  const owner = categoryOwner(c.id, row.key);
                  const checked = row.categoryIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <label className={cn('flex items-center gap-2 text-sm', owner ? 'text-muted' : 'text-fg')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={Boolean(owner)}
                          onChange={(e) =>
                            patch(row.key, {
                              categoryIds: e.target.checked ? [...row.categoryIds, c.id] : row.categoryIds.filter((id) => id !== c.id),
                            })
                          }
                        />
                        {c.icon} {c.name}
                        {owner && <span className="text-xs">(dipakai {owner})</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : (
            <div>
              <Label htmlFor={`goal-${row.key}`}>Goal terhubung</Label>
              <Select id={`goal-${row.key}`} value={row.goalId} onChange={(e) => patch(row.key, { goalId: e.target.value })}>
                <option value="">Pilih goal…</option>
                {goals?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon} {g.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() =>
            edit([
              ...rows,
              { key: newKey(), name: '', description: '', kind: 'EXPENSE', percent: '0', color: '#38bdf8', icon: '', categoryIds: [], goalId: '' },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Tambah pos
        </Button>
        <p
          role="status"
          className={cn('text-sm font-medium', total === 100 ? 'text-income' : 'text-expense')}
        >
          Total {total}%{total === 100 ? ' ✓' : total < 100 ? ` — kurang ${100 - total}%` : ` — lebih ${total - 100}%`}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => {
              setDraft(null);
              setError(undefined);
            }}>
            Batalkan perubahan
          </Button>
        )}
        <Button onClick={submit} disabled={!dirty || total !== 100 || save.isPending}>
          {save.isPending ? 'Menyimpan…' : `Simpan ${PHASE_LABEL[phase]}`}
        </Button>
      </div>
    </div>
  );
}

export function AllocationSettingsPage() {
  const { data: plan, isLoading, error, refetch } = useAllocationPlan();
  const [phase, setPhase] = useState<1 | 2>(1);
  const [showTemplate, setShowTemplate] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atur Alokasi"
        subtitle="Gaji bulanan dan pembagian pos per fase. Total tiap fase harus 100%."
        actions={
          <Link to="/tabungan" className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm text-fg hover:bg-surface-2">
            <ArrowLeft className="h-4 w-4" /> Kembali
          </Link>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat rencana alokasi.')} onRetry={() => refetch()} />
      ) : !plan ? (
        <EmptyState
          message="Belum ada rencana alokasi."
          action={<Button onClick={() => setShowTemplate(true)}>Buat dari template</Button>}
        />
      ) : (
        <>
          <IncomeCard key={plan.monthlyIncome} plan={plan} />
          <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-md border border-line p-1">
            {([1, 2] as const).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={phase === p}
                onClick={() => setPhase(p)}
                className={cn('rounded px-3 py-1.5 text-sm transition-colors', phase === p ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg')}
              >
                {PHASE_LABEL[p]}
                {plan.activePhase === p && ' (aktif)'}
              </button>
            ))}
          </div>
          <PhaseEditor key={`${phase}-${plan.id}-${JSON.stringify(plan.phases[phase].map((i) => [i.id, i.percent]))}`} plan={plan} phase={phase} />
        </>
      )}

      {showTemplate && <TemplateDialog onClose={() => setShowTemplate(false)} />}
    </div>
  );
}
