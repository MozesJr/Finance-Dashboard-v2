import { useState } from 'react';
import { MoneyInputSchema } from 'shared';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { useCategories } from '@/features/categories/hooks';
import { useWallets } from '@/features/wallets/hooks';
import { getErrorMessage } from '@/lib/errors';
import type { BillDto, BillPayload } from '../api';

const INTERVALS = [
  { value: 1, label: 'Bulanan' },
  { value: 2, label: 'Tiap 2 bulan' },
  { value: 3, label: 'Tiap 3 bulan' },
  { value: 6, label: 'Tiap 6 bulan' },
  { value: 12, label: 'Tahunan' },
];

interface Props {
  bill?: BillDto;
  submitting: boolean;
  error: unknown;
  onSubmit: (payload: BillPayload) => void;
  onCancel: () => void;
}

/** Form tambah/ubah tagihan berkala. Validasi nominal memakai skema yang sama dengan API. */
export function BillForm({ bill, submitting, error, onSubmit, onCancel }: Props) {
  const { data: categories } = useCategories('EXPENSE');
  const { data: wallets } = useWallets(false);
  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState(bill?.amount ?? '');
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [walletId, setWalletId] = useState(bill?.walletId ?? '');
  const [interval, setIntervalMonths] = useState(bill?.intervalMonths ?? 1);
  const [due, setDue] = useState(bill?.nextDueDate ?? '');
  const [remind, setRemind] = useState((bill?.remindDays ?? [7, 1]).join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Nama tagihan wajib diisi';
    const parsed = MoneyInputSchema.safeParse(amount);
    if (!parsed.success || parsed.data <= 0n) next.amount = 'Nominal tidak valid';
    if (!categoryId) next.categoryId = 'Kategori wajib dipilih';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) next.due = 'Tanggal jatuh tempo wajib diisi';
    const days = remind.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 60) || days.length > 5) next.remind = 'Isi angka hari (0–60), pisahkan dengan koma, maksimal 5';
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    onSubmit({
      name: name.trim(),
      amount: parsed.data.toString(),
      categoryId,
      walletId: walletId || null,
      intervalMonths: interval,
      nextDueDate: due,
      remindDays: days,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="bill-name">Nama</Label>
        <Input id="bill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kos, Asuransi, Internet" maxLength={60} />
        <FieldError message={errors.name} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="bill-amount">Nominal sekali bayar</Label>
          <Input id="bill-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="text" placeholder="mis. 3jt atau 3.000.000" />
          <FieldError message={errors.amount} />
        </div>
        <div>
          <Label htmlFor="bill-interval">Interval</Label>
          <Select id="bill-interval" value={interval} onChange={(e) => setIntervalMonths(Number(e.target.value))}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="bill-category">Kategori</Label>
        <Select id="bill-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Pilih kategori…</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}
              {c.name}
            </option>
          ))}
        </Select>
        <FieldError message={errors.categoryId} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="bill-wallet">Dompet pembayaran (opsional)</Label>
          <Select id="bill-wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">Dompet default</option>
            {wallets?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="bill-due">Jatuh tempo berikutnya</Label>
          <Input id="bill-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <FieldError message={errors.due} />
        </div>
      </div>
      <div>
        <Label htmlFor="bill-remind">Ingatkan (hari sebelum jatuh tempo)</Label>
        <Input id="bill-remind" value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="7, 1" />
        <p className="mt-1 text-xs text-muted">Pengingat dikirim ke Telegram pukul 08.00 WIB. 0 = di hari jatuh tempo.</p>
        <FieldError message={errors.remind} />
      </div>
      {interval > 1 && (
        <p className="rounded-md bg-surface-2 p-2 text-xs text-muted">
          Saat dibayar, pengeluaran dibagi rata ke {interval} periode di laporan (saldo dompet berkurang penuh di hari bayar).
        </p>
      )}
      {error != null && <p className="text-sm text-expense">{getErrorMessage(error)}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </div>
    </form>
  );
}
