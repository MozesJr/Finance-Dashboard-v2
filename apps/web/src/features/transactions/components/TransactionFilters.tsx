import { X } from 'lucide-react';
import type { TxType } from 'shared';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useCategories } from '@/features/categories/hooks';
import { useWallets } from '@/features/wallets/hooks';
import type { TransactionFilters } from '../api';
import { TX_TYPE_LABELS } from '../labels';

interface Props {
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
}

export function TransactionFiltersBar({ value, onChange }: Props) {
  const { data: wallets } = useWallets(true);
  const { data: categories } = useCategories();
  const set = (patch: Partial<TransactionFilters>) => onChange({ ...value, ...patch });
  const active = Object.values(value).some(Boolean);

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        type="search"
        placeholder="Cari toko atau catatan…"
        aria-label="Cari"
        value={value.q ?? ''}
        onChange={(e) => set({ q: e.target.value })}
        className="lg:col-span-2"
      />
      <Select aria-label="Jenis" value={value.type ?? ''} onChange={(e) => set({ type: (e.target.value || undefined) as TxType | undefined })}>
        <option value="">Semua jenis</option>
        {Object.entries(TX_TYPE_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>
      <Select aria-label="Dompet" value={value.walletId ?? ''} onChange={(e) => set({ walletId: e.target.value || undefined })}>
        <option value="">Semua dompet</option>
        {wallets?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Kategori" value={value.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
        <option value="">Semua kategori</option>
        {categories?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type === 'INCOME' ? 'masuk' : 'keluar'})
          </option>
        ))}
      </Select>
      <Input type="date" aria-label="Dari tanggal" value={value.dateFrom ?? ''} max={value.dateTo || undefined} onChange={(e) => set({ dateFrom: e.target.value || undefined })} />
      <Input type="date" aria-label="Sampai tanggal" value={value.dateTo ?? ''} min={value.dateFrom || undefined} onChange={(e) => set({ dateTo: e.target.value || undefined })} />
      {active && (
        <Button variant="ghost" onClick={() => onChange({})}>
          <X className="h-4 w-4" /> Reset filter
        </Button>
      )}
    </div>
  );
}
