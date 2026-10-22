import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCategoryInput, CreateCategorySchema } from 'shared';
import { Button } from '@/components/ui/button';
import { ColorInput, FieldError, Input, Label, Select } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/errors';
import type { CategoryDto, CategoryPayload } from '../api';

interface CategoryFormProps {
  category?: CategoryDto;
  defaultType: 'INCOME' | 'EXPENSE';
  submitting: boolean;
  error: unknown;
  onSubmit: (payload: CategoryPayload) => void;
  onCancel: () => void;
}

export function CategoryForm({ category, defaultType, submitting, error, onSubmit, onCancel }: CategoryFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateCategoryInput>({
    resolver: zodResolver(CreateCategorySchema),
    defaultValues: {
      name: category?.name ?? '',
      type: category?.type ?? defaultType,
      icon: category?.icon ?? '',
      color: category?.color ?? '#3b82f6',
    },
  });

  const submit = (data: CreateCategoryInput) => {
    const payload: CategoryPayload = { name: data.name, icon: data.icon || null, color: data.color ?? null };
    // Tipe tidak bisa diubah setelah dibuat.
    onSubmit(category ? payload : { ...payload, type: data.type });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="cat-name">Nama</Label>
        <Input id="cat-name" placeholder="mis. Kopi" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="cat-type">Jenis</Label>
        <Select id="cat-type" disabled={Boolean(category)} {...register('type')}>
          <option value="EXPENSE">Pengeluaran</option>
          <option value="INCOME">Pemasukan</option>
        </Select>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <Label htmlFor="cat-icon">Ikon (emoji)</Label>
          <Input id="cat-icon" maxLength={16} placeholder="☕" {...register('icon', { setValueAs: (v) => (v === '' ? null : v) })} />
          <FieldError message={errors.icon?.message} />
        </div>
        <div>
          <Label htmlFor="cat-color">Warna</Label>
          <Controller
            control={control}
            name="color"
            render={({ field }) => <ColorInput id="cat-color" value={field.value} onChange={field.onChange} />}
          />
        </div>
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
