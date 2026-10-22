import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreateWalletSchema } from 'shared';
import { Button } from '@/components/ui/button';
import { ColorInput, FieldError, Input, Label, Select } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/errors';
import type { WalletDto, WalletPayload } from '../api';
import { WALLET_TYPE_LABELS } from '../labels';

type FormInput = z.input<typeof CreateWalletSchema>;
type FormOutput = z.output<typeof CreateWalletSchema>;

interface WalletFormProps {
  wallet?: WalletDto;
  submitting: boolean;
  error: unknown;
  onSubmit: (payload: WalletPayload) => void;
  onCancel: () => void;
}

export function WalletForm({ wallet, submitting, error, onSubmit, onCancel }: WalletFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateWalletSchema),
    defaultValues: wallet
      ? { name: wallet.name, type: wallet.type, initialBalance: wallet.initialBalance, color: wallet.color }
      : { name: '', type: 'CASH', initialBalance: '', color: '#3b82f6' },
  });

  const submit = (data: FormOutput) =>
    onSubmit({
      name: data.name,
      type: data.type,
      initialBalance: data.initialBalance.toString(), // bigint → string untuk JSON
      color: data.color ?? null,
    });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="wallet-name">Nama</Label>
        <Input id="wallet-name" placeholder="mis. BCA, Dompet" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="wallet-type">Jenis</Label>
        <Select id="wallet-type" {...register('type')}>
          {Object.entries(WALLET_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="wallet-balance">Saldo awal</Label>
        <Input id="wallet-balance" inputMode="text" placeholder="mis. 1jt atau 1.250.000" {...register('initialBalance')} />
        <FieldError message={errors.initialBalance?.message} />
      </div>
      <div>
        <Label htmlFor="wallet-color">Warna</Label>
        <Controller
          control={control}
          name="color"
          render={({ field }) => <ColorInput id="wallet-color" value={field.value} onChange={field.onChange} />}
        />
        <FieldError message={errors.color?.message} />
      </div>
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
