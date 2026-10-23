import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/errors';
import { useReceiptImage } from '../hooks';

/** Lihat gambar struk milik transaksi (endpoint hanya untuk pemilik). */
export function ReceiptViewerDialog({ receiptId, onClose }: { receiptId: string; onClose: () => void }) {
  const { data: url, isLoading, error, refetch } = useReceiptImage(receiptId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Struk" className="max-w-lg">
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : error || !url ? (
          <ErrorState message={getErrorMessage(error, 'Gagal memuat gambar struk.')} onRetry={() => refetch()} />
        ) : (
          <img src={url} alt="Foto struk" className="max-h-[70vh] w-full rounded-md object-contain" />
        )}
      </DialogContent>
    </Dialog>
  );
}
