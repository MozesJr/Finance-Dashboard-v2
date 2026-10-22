import { useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CategoryType } from 'shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from './hooks';
import { CategoryForm } from './components/CategoryForm';
import type { CategoryDto } from './api';

const TABS: Array<{ type: CategoryType; label: string }> = [
  { type: 'EXPENSE', label: 'Pengeluaran' },
  { type: 'INCOME', label: 'Pemasukan' },
];

type FormState = { mode: 'create' } | { mode: 'edit'; category: CategoryDto } | null;

export function CategoriesPage() {
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<CategoryDto | null>(null);

  const { data: categories, isLoading, error, refetch } = useCategories(type);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const closeForm = () => {
    setForm(null);
    create.reset();
    update.reset();
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => toast.success('Kategori dihapus'),
      onError: (e) => toast.error(getErrorMessage(e)),
      onSettled: () => setToDelete(null),
    });
  };

  return (
    <div>
      <PageHeader
        title="Kategori"
        subtitle="Kategori bawaan tidak bisa diubah. Tambahkan kategori sendiri sesuai kebutuhan."
        actions={
          <Button onClick={() => setForm({ mode: 'create' })}>
            <Plus className="h-4 w-4" /> Tambah kategori
          </Button>
        }
      />

      <div role="tablist" className="mb-4 inline-flex rounded-md border border-line p-1">
        {TABS.map((t) => (
          <button
            key={t.type}
            role="tab"
            aria-selected={type === t.type}
            onClick={() => setType(t.type)}
            className={cn(
              'rounded px-4 py-1.5 text-sm transition-colors',
              type === t.type ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={getErrorMessage(error, 'Gagal memuat kategori.')} onRetry={() => refetch()} />
      ) : !categories || categories.length === 0 ? (
        <EmptyState
          message="Belum ada kategori di jenis ini."
          action={<Button onClick={() => setForm({ mode: 'create' })}>Tambah kategori</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: c.color ?? undefined }}
              >
                {c.icon ?? '🏷️'}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{c.name}</p>
              {c.isSystem ? (
                <span className="flex items-center gap-1 text-xs text-muted" title="Kategori bawaan">
                  <Lock className="h-3 w-3" /> Bawaan
                </span>
              ) : (
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label={`Ubah ${c.name}`} onClick={() => setForm({ mode: 'edit', category: c })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Hapus ${c.name}`} onClick={() => setToDelete(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && closeForm()}>
        {form && (
          <DialogContent title={form.mode === 'create' ? 'Tambah kategori' : 'Ubah kategori'}>
            <CategoryForm
              category={form.mode === 'edit' ? form.category : undefined}
              defaultType={type}
              submitting={create.isPending || update.isPending}
              error={form.mode === 'create' ? create.error : update.error}
              onCancel={closeForm}
              onSubmit={(payload) => {
                const done = {
                  onSuccess: () => {
                    toast.success('Kategori disimpan');
                    closeForm();
                  },
                };
                if (form.mode === 'create') create.mutate(payload, done);
                else update.mutate({ id: form.category.id, payload }, done);
              }}
            />
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Hapus kategori?"
        description={`Kategori "${toDelete?.name ?? ''}" akan dihapus. Kategori yang masih dipakai transaksi tidak bisa dihapus.`}
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
