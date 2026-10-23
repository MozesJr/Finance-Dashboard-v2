import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateContributionSchema, getTodayInJakarta, toDateString } from 'shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { useWallets } from '@/features/wallets/hooks';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import type { GoalDto } from '../api';
import { useAddContribution } from '../hooks';

type FormInput = z.input<typeof CreateContributionSchema>;
type FormOutput = z.output<typeof CreateContributionSchema>;

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

interface Props {
  goal: GoalDto;
  type: 'DEPOSIT' | 'WITHDRAW';
  onClose: () => void;
}

export function ContributionDialog({ goal, type, onClose }: Props) {
  const isDeposit = type === 'DEPOSIT';
  const { data: wallets } = useWallets(false);
  const add = useAddContribution();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateContributionSchema),
    defaultValues: { type, amount: '', date: toDateString(getTodayInJakarta()), note: null, walletId: null, counterWalletId: null },
  });

  const counterWallets = wallets?.filter((w) => w.id !== goal.walletId) ?? [];
  // Goal tanpa dompet penyimpanan: dompet tempat dana disimpan dipilih per transaksi.
  const pickStorage = goal.walletId === null;

  const submit = (data: FormOutput) =>
    add.mutate(
      {
        goalId: goal.id,
        payload: {
          type: data.type,
          amount: data.amount.toString(),
          date: data.date,
          note: data.note || null,
          walletId: data.walletId ?? null,
          ...(pickStorage ? { counterWalletId: data.counterWalletId ?? null } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(isDeposit ? 'Setoran dicatat' : 'Penarikan dicatat');
          onClose();
        },
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${isDeposit ? 'Setor ke' : 'Tarik dari'} ${goal.name}`}
        description={`Terkumpul saat ini ${formatMoney(goal.collected)}`}
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <input type="hidden" {...register('type')} />
          <div>
            <Label htmlFor="c-amount">Nominal</Label>
            <Input id="c-amount" inputMode="text" placeholder="mis. 500rb atau 1.250.000" {...register('amount')} />
            <FieldError message={errors.amount?.message} />
          </div>
          <div>
            <Label htmlFor="c-wallet">{isDeposit ? 'Sumber dana (dompet)' : 'Tujuan dana (dompet)'}</Label>
            <Select id="c-wallet" {...register('walletId', { setValueAs: emptyToNull })}>
              <option value="">Tidak dicatat sebagai transfer</option>
              {counterWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              {pickStorage
                ? 'Kosongkan jika tidak perlu mencatat perpindahan dana.'
                : `Jika dipilih, transfer antara dompet ini dan ${goal.wallet?.name} dicatat otomatis.`}
            </p>
            <FieldError message={errors.walletId?.message} />
          </div>
          {pickStorage && (
            <div>
              <Label htmlFor="c-counter">{isDeposit ? 'Dompet tujuan (tempat dana disimpan)' : 'Dompet asal (tempat dana disimpan)'}</Label>
              <Select id="c-counter" {...register('counterWalletId', { setValueAs: emptyToNull })}>
                <option value="">Tidak dicatat sebagai transfer</option>
                {counterWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">Isi bersama dompet di atas; keduanya dicatat sebagai satu transfer.</p>
              <FieldError message={errors.counterWalletId?.message} />
            </div>
          )}
          <div>
            <Label htmlFor="c-date">Tanggal</Label>
            <Input id="c-date" type="date" {...register('date')} />
            <FieldError message={errors.date?.message} />
          </div>
          <div>
            <Label htmlFor="c-note">Catatan (opsional)</Label>
            <Input id="c-note" maxLength={200} {...register('note', { setValueAs: emptyToNull })} />
          </div>
          {add.error != null && <p className="text-sm text-expense">{getErrorMessage(add.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Menyimpan…' : isDeposit ? 'Setor' : 'Tarik'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
