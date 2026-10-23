import { useState } from 'react';
import { toast } from 'sonner';
import { getTodayInJakarta, MoneyInputSchema, toDateString } from 'shared';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { useWallets } from '@/features/wallets/hooks';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import type { BillDto } from '../api';
import { usePayBill } from '../hooks';

/** Bayar tagihan: nominal boleh berbeda (kenaikan harga) dengan opsi memperbarui nominal tagihan. */
export function PayBillDialog({ bill, onClose }: { bill: BillDto; onClose: () => void }) {
  const { data: wallets } = useWallets(false);
  const pay = usePayBill();
  const [amount, setAmount] = useState(bill.amount);
  const [walletId, setWalletId] = useState(bill.walletId ?? '');
  const [date, setDate] = useState(toDateString(getTodayInJakarta()));
  const [updateAmount, setUpdateAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = MoneyInputSchema.safeParse(amount);
  const different = parsed.success && parsed.data.toString() !== bill.amount;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.success || parsed.data <= 0n) return setError('Nominal tidak valid');
    setError(null);
    pay.mutate(
      { id: bill.id, payload: { amount: parsed.data.toString(), walletId: walletId || null, date, updateBillAmount: different && updateAmount } },
      {
        onSuccess: (r) => {
          toast.success(r.message);
          onClose();
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-muted">
        Membuat transaksi pengeluaran
        {bill.intervalMonths > 1 ? ` yang dibagi rata ke ${bill.intervalMonths} periode di laporan` : ''}, lalu memajukan jatuh tempo {bill.intervalMonths} bulan.
      </p>
      <div>
        <Label htmlFor="pay-amount">Nominal dibayar</Label>
        <Input id="pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="text" />
        <FieldError message={error ?? undefined} />
      </div>
      {different && (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={updateAmount} onChange={(e) => setUpdateAmount(e.target.checked)} />
          Jadikan nominal tagihan seterusnya (sebelumnya {formatMoney(bill.amount)})
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pay-wallet">Dompet</Label>
          <Select id="pay-wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">{bill.payWalletName ? `${bill.payWalletName} (bawaan)` : 'Dompet default'}</option>
            {wallets?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pay-date">Tanggal bayar</Label>
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" disabled={pay.isPending}>
          {pay.isPending ? 'Memproses…' : 'Bayar'}
        </Button>
      </div>
    </form>
  );
}
