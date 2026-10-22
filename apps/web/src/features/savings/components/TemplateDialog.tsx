import { useState } from 'react';
import { toast } from 'sonner';
import { MoneyInputSchema } from 'shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldError, Input, Label } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/errors';
import { useCreateFromTemplate } from '../hooks';

export function TemplateDialog({ onClose }: { onClose: () => void }) {
  const [income, setIncome] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const create = useCreateFromTemplate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = MoneyInputSchema.safeParse(income);
    if (!parsed.success || parsed.data <= 0n) {
      setFieldError(parsed.success ? 'Gaji harus lebih dari 0' : parsed.error.issues[0].message);
      return;
    }
    setFieldError(undefined);
    create.mutate(parsed.data.toString(), {
      onSuccess: () => {
        toast.success('Rencana alokasi dibuat');
        onClose();
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Buat alokasi dari template"
        description="Perpuluhan 10%, Kebutuhan Primer 45%, Dana Darurat 15%, Investasi 15%, Gaya Hidup 15%. Fase 2: Dana Darurat 0% dan Investasi 30%."
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="t-income">Gaji bulanan</Label>
            <Input id="t-income" placeholder="mis. 10jt atau 10.000.000" value={income} onChange={(e) => setIncome(e.target.value)} />
            <FieldError message={fieldError} />
          </div>
          {create.error != null && <p className="text-sm text-expense">{getErrorMessage(create.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Membuat…' : 'Buat rencana'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
