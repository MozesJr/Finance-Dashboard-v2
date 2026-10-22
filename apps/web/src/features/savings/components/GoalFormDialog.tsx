import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateGoalSchema } from 'shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { useWallets } from '@/features/wallets/hooks';
import { getErrorMessage } from '@/lib/errors';
import type { GoalDto, GoalPayload } from '../api';
import { useCreateGoal, useUpdateGoal } from '../hooks';

type FormInput = z.input<typeof CreateGoalSchema>;
type FormOutput = z.output<typeof CreateGoalSchema>;

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);
const numberOrNull = (v: unknown) => (v === '' || v === undefined || v === null ? null : Number(v));

interface Props {
  goal?: GoalDto;
  defaultType?: 'EMERGENCY' | 'INVESTMENT' | 'CUSTOM';
  onClose: () => void;
}

export function GoalFormDialog({ goal, defaultType = 'CUSTOM', onClose }: Props) {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const { data: wallets } = useWallets(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateGoalSchema),
    defaultValues: {
      name: goal?.name ?? '',
      type: goal?.type ?? defaultType,
      icon: goal?.icon ?? '',
      color: goal?.color ?? '#38bdf8',
      targetMode: goal?.targetMode ?? (defaultType === 'EMERGENCY' ? 'MONTHS_OF_EXPENSE' : 'MANUAL'),
      targetAmount: goal?.targetAmount ?? null,
      targetMonths: goal?.targetMonths ?? 6,
      targetDate: goal?.targetDate ?? null,
      walletId: goal?.walletId ?? null,
    },
  });
  const mode = useWatch({ control, name: 'targetMode' });
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const submit = (data: FormOutput) => {
    const payload: GoalPayload = {
      name: data.name,
      icon: data.icon || null,
      color: data.color ?? null,
      targetMode: data.targetMode,
      targetAmount: data.targetMode === 'MANUAL' && data.targetAmount !== null && data.targetAmount !== undefined ? data.targetAmount.toString() : null,
      targetMonths: data.targetMode === 'MONTHS_OF_EXPENSE' ? (data.targetMonths ?? 6) : null,
      targetDate: data.targetDate ?? null,
      walletId: data.walletId ?? null,
    };
    const done = {
      onSuccess: () => {
        toast.success('Goal disimpan');
        onClose();
      },
    };
    if (goal) update.mutate({ id: goal.id, payload }, done);
    else create.mutate({ ...payload, type: data.type }, done);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={goal ? 'Ubah goal' : 'Tambah goal'}>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="g-name">Nama</Label>
            <Input id="g-name" placeholder="mis. Liburan, Reksa dana" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="g-type">Jenis</Label>
              <Select id="g-type" disabled={Boolean(goal)} {...register('type')}>
                <option value="CUSTOM">Lainnya</option>
                <option value="INVESTMENT">Investasi</option>
                <option value="EMERGENCY">Dana darurat</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="g-icon">Ikon</Label>
                <Input id="g-icon" maxLength={16} placeholder="🎯" {...register('icon')} />
              </div>
              <div>
                <Label htmlFor="g-color">Warna</Label>
                <Input id="g-color" type="color" className="h-10 w-12 p-1" {...register('color')} />
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="g-mode">Cara menentukan target</Label>
            <Select id="g-mode" {...register('targetMode')}>
              <option value="MANUAL">Nominal manual</option>
              <option value="MONTHS_OF_EXPENSE">Kelipatan bulan pengeluaran</option>
            </Select>
          </div>
          {mode === 'MANUAL' ? (
            <div>
              <Label htmlFor="g-amount">Target (opsional)</Label>
              <Input id="g-amount" placeholder="mis. 50jt" {...register('targetAmount', { setValueAs: emptyToNull })} />
              <FieldError message={errors.targetAmount?.message} />
            </div>
          ) : (
            <div>
              <Label htmlFor="g-months">Jumlah bulan pengeluaran</Label>
              <Input id="g-months" type="number" min={1} max={60} {...register('targetMonths', { setValueAs: numberOrNull })} />
              <p className="mt-1 text-xs text-muted">Target = jumlah bulan × rata-rata pengeluaran 3 bulan penuh terakhir.</p>
              <FieldError message={errors.targetMonths?.message} />
            </div>
          )}
          <div>
            <Label htmlFor="g-date">Target tanggal (opsional)</Label>
            <Input id="g-date" type="date" {...register('targetDate', { setValueAs: emptyToNull })} />
            <FieldError message={errors.targetDate?.message} />
          </div>
          <div>
            <Label htmlFor="g-wallet">Dompet penyimpanan (opsional)</Label>
            <Select id="g-wallet" {...register('walletId', { setValueAs: emptyToNull })}>
              <option value="">Tanpa dompet</option>
              {wallets?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">Rekening/RDPU tempat dana disimpan. Diperlukan untuk mencatat transfer otomatis saat setor/tarik.</p>
          </div>
          {error != null && <p className="text-sm text-expense">{getErrorMessage(error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
