import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreateTransactionSchema, getTodayInJakarta, toDateString, TxType } from 'shared';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { useCategories } from '@/features/categories/hooks';
import { useWallets } from '@/features/wallets/hooks';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { TransactionDto, TransactionPayload } from '../api';
import { TX_TYPE_LABELS } from '../labels';

type FormInput = z.input<typeof CreateTransactionSchema>;
type FormOutput = z.output<typeof CreateTransactionSchema>;

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

interface Props {
  transaction?: TransactionDto;
  submitting: boolean;
  error: unknown;
  onSubmit: (payload: TransactionPayload) => void;
  onCancel: () => void;
}

export function TransactionForm({ transaction, submitting, error, onSubmit, onCancel }: Props) {
  const { data: wallets } = useWallets(true);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateTransactionSchema),
    defaultValues: {
      type: transaction?.type ?? 'EXPENSE',
      walletId: transaction?.walletId ?? '',
      toWalletId: transaction?.toWalletId ?? null,
      categoryId: transaction?.categoryId ?? null,
      amount: transaction?.amount ?? '',
      date: transaction?.date ?? toDateString(getTodayInJakarta()),
      merchant: transaction?.merchant ?? null,
      note: transaction?.note ?? null,
    },
  });

  const type = useWatch({ control, name: 'type' }) as TxType;
  const isTransfer = type === 'TRANSFER';
  const { data: categories } = useCategories(isTransfer ? undefined : type);

  // Ganti jenis → kategori/tujuan sebelumnya tidak berlaku lagi.
  useEffect(() => {
    if (isTransfer) setValue('categoryId', null);
    else setValue('toWalletId', null);
  }, [isTransfer, setValue]);

  const usableWallets = wallets?.filter(
    (w) => !w.isArchived || w.id === transaction?.walletId || w.id === transaction?.toWalletId,
  );

  const submit = (data: FormOutput) =>
    onSubmit({
      type: data.type,
      walletId: data.walletId,
      toWalletId: data.toWalletId ?? null,
      categoryId: data.categoryId ?? null,
      amount: data.amount.toString(), // bigint → string untuk JSON
      date: data.date,
      merchant: data.merchant || null,
      note: data.note || null,
    });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div role="radiogroup" aria-label="Jenis transaksi" className="grid grid-cols-3 gap-1 rounded-md border border-line p-1">
        {(Object.keys(TX_TYPE_LABELS) as TxType[]).map((t) => (
          <label
            key={t}
            className={cn(
              'cursor-pointer rounded px-2 py-1.5 text-center text-sm transition-colors',
              type === t ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
            )}
          >
            <input type="radio" value={t} className="sr-only" {...register('type')} />
            {TX_TYPE_LABELS[t]}
          </label>
        ))}
      </div>

      <div>
        <Label htmlFor="tx-amount">Nominal</Label>
        <Input id="tx-amount" inputMode="text" placeholder="mis. 35rb atau 1.250.000" {...register('amount')} />
        <FieldError message={errors.amount?.message} />
      </div>

      <div className={cn('grid gap-3', isTransfer && 'sm:grid-cols-2')}>
        <div>
          <Label htmlFor="tx-wallet">{isTransfer ? 'Dari dompet' : 'Dompet'}</Label>
          <Select id="tx-wallet" {...register('walletId')}>
            <option value="">Pilih dompet…</option>
            {usableWallets?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <FieldError message={errors.walletId?.message} />
        </div>
        {isTransfer && (
          <div>
            <Label htmlFor="tx-to-wallet">Ke dompet</Label>
            <Select id="tx-to-wallet" {...register('toWalletId', { setValueAs: emptyToNull })}>
              <option value="">Pilih dompet…</option>
              {usableWallets?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <FieldError message={errors.toWalletId?.message} />
          </div>
        )}
      </div>

      {!isTransfer && (
        <div>
          <Label htmlFor="tx-category">Kategori</Label>
          <Select id="tx-category" {...register('categoryId', { setValueAs: emptyToNull })}>
            <option value="">Pilih kategori…</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </option>
            ))}
          </Select>
          <FieldError message={errors.categoryId?.message} />
        </div>
      )}

      <div>
        <Label htmlFor="tx-date">Tanggal</Label>
        <Input id="tx-date" type="date" {...register('date')} />
        <FieldError message={errors.date?.message} />
      </div>

      <div>
        <Label htmlFor="tx-merchant">Toko / sumber (opsional)</Label>
        <Input id="tx-merchant" maxLength={200} {...register('merchant', { setValueAs: emptyToNull })} />
        <FieldError message={errors.merchant?.message} />
      </div>
      <div>
        <Label htmlFor="tx-note">Catatan (opsional)</Label>
        <Input id="tx-note" maxLength={200} {...register('note', { setValueAs: emptyToNull })} />
        <FieldError message={errors.note?.message} />
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
