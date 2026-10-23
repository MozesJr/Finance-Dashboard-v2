import { useState } from 'react';
import { toast } from 'sonner';
import { getPeriod, MAX_PERIOD_START_DAY } from 'shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/errors';
import { useSettings, useUpdateSettings } from '../hooks';

const DAYS = Array.from({ length: MAX_PERIOD_START_DAY }, (_, i) => i + 1);

export function PeriodSettings() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? data?.periodStartDay ?? 1;
  const changed = data !== undefined && value !== data.periodStartDay;
  const example = getPeriod(new Date(), value);

  const save = () =>
    update.mutate(value, {
      onSuccess: () => {
        setDraft(null);
        toast.success('Periode keuangan diperbarui');
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });

  return (
    <Card className="space-y-3" data-testid="period-settings">
      <div>
        <h2 className="text-base font-semibold text-fg">Periode keuangan</h2>
        <p className="mt-1 text-sm text-muted">
          Atur tanggal mulai periode agar dashboard, alokasi, tabungan, dan insight mengikuti tanggal gajianmu. Tanggal 1
          berarti bulan kalender biasa. Periode dinamai bulan tempat periode <em>berakhir</em>.
        </p>
      </div>
      <div className="max-w-xs">
        <Label htmlFor="period-start-day">Periode dimulai tanggal</Label>
        <Select id="period-start-day" disabled={isLoading} value={value} onChange={(e) => setDraft(Number(e.target.value))}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d === 1 ? '1 (bulan kalender)' : d}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-sm text-muted" data-testid="period-example">
        Contoh: periode berjalan jadi <span className="font-medium text-fg">{example.label}</span>.
      </p>
      <p className="text-xs text-muted">
        Transaksi tidak diubah. Insight AI yang tersimpan dibuat ulang saat dibuka. Maksimal tanggal {MAX_PERIOD_START_DAY} agar ada di setiap bulan.
      </p>
      <div className="flex gap-2">
        <Button onClick={save} disabled={!changed || update.isPending}>
          {update.isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
        {changed && (
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Batal
          </Button>
        )}
      </div>
    </Card>
  );
}
