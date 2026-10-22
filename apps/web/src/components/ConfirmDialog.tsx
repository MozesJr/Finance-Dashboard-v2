import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  /** false untuk aksi yang tidak merusak data (tombol biasa, bukan merah). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Hapus',
  loading,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Batal
          </Button>
          <Button variant={destructive ? 'danger' : 'default'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Memproses…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
