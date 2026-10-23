import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { MoneyInputSchema } from 'shared';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { formatMoney } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { useSetValuation, useValuations } from '../hooks';
import type { WalletDto } from '../api';
import { formatSigned } from '../labels';

const FormSchema = z.object({ value: MoneyInputSchema });
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

interface Props {
  wallet: WalletDto;
  onClose: () => void;
}

/** "Perbarui nilai": nilai pasar terkini → selisih dicatat sebagai penyesuaian (bukan pemasukan/pengeluaran). */
export function ValuationDialog({ wallet, onClose }: Props) {
  const mutation = useSetValuation();
  const history = useValuations(wallet.id);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(FormSchema),
    defaultValues: { value: wallet.balance },
  });

  const typed = useWatch({ control, name: 'value' });
  const preview = (() => {
    const parsed = FormSchema.safeParse({ value: typed });
    return parsed.success ? parsed.data.value - BigInt(wallet.balance) : null;
  })();

  const submit = (data: FormOutput) =>
    mutation.mutate(
      { id: wallet.id, value: data.value.toString() },
      {
        onSuccess: (res) => {
          toast.success(res.adjustment ? `Nilai ${wallet.name} diperbarui` : 'Nilai tidak berubah');
          onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(submit)} className="space-y-3" noValidate>
        <p className="text-sm text-muted">
          Nilai sekarang <span className="font-medium text-fg">{formatMoney(wallet.balance)}</span>. Masukkan nilai pasar
          terkini; selisihnya dicatat sebagai <em>penyesuaian nilai</em> dan tidak dihitung sebagai pemasukan atau
          pengeluaran.
        </p>
        <div>
          <Label htmlFor="valuation-value">Nilai terkini</Label>
          <Input id="valuation-value" inputMode="text" placeholder="mis. 8,7jt atau 8.700.000" {...register('value')} />
          <FieldError message={errors.value?.message} />
        </div>
        {preview !== null && preview !== 0n && (
          <p className={preview > 0n ? 'text-sm text-income' : 'text-sm text-expense'}>
            Selisih: {formatSigned(preview.toString(), formatMoney)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Menyimpan…' : 'Simpan nilai'}
          </Button>
        </div>
      </form>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Riwayat pembaruan</p>
        {history.isLoading ? (
          <p className="text-sm text-muted">Memuat…</p>
        ) : !history.data || history.data.length === 0 ? (
          <p className="text-sm text-muted">Belum ada pembaruan nilai.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {history.data.map((h) => (
              <li key={h.id} className="flex justify-between">
                <span className="text-muted">{h.date}</span>
                <span className={BigInt(h.amount) >= 0n ? 'text-income' : 'text-expense'}>
                  {formatSigned(h.amount, formatMoney)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
