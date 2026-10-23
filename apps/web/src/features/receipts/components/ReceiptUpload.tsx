import { useRef } from 'react';
import { Receipt as ReceiptIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import type { ReceiptParseDto } from '../api';
import { useParseReceipt } from '../hooks';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

interface Props {
  /** Hasil baca struk (formulir mengisi dirinya sendiri; user tetap menekan Simpan). */
  onParsed: (receipt: ReceiptParseDto) => void;
  attached: ReceiptParseDto | null;
}

export function ReceiptUpload({ onParsed, attached }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const parse = useParseReceipt();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Ukuran file maksimal 10 MB.');
      return;
    }
    parse.mutate(file, {
      onSuccess: (data) => {
        onParsed(data);
        toast.success('Struk terbaca. Periksa lalu simpan.');
      },
      onError: (e) => toast.error(getErrorMessage(e, 'Struk gagal dibaca.')),
    });
  };

  return (
    <div className="rounded-md border border-dashed border-line p-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        aria-label="Pilih foto struk"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={parse.isPending} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />
        {parse.isPending ? 'Membaca struk…' : attached ? 'Ganti struk' : 'Unggah struk'}
      </Button>
      <p className="mt-1 text-xs text-muted">Foto struk akan mengisi formulir otomatis. Kamu tetap perlu memeriksa dan menekan Simpan.</p>

      {attached && (
        <div role="status" className="mt-3 space-y-1 rounded-md bg-surface-2 p-3 text-xs">
          <p className="flex items-center gap-2 font-medium text-fg">
            <ReceiptIcon className="h-4 w-4 text-primary" />
            {attached.merchant ?? 'Struk'} · {formatMoney(attached.total)}
          </p>
          {attached.items.slice(0, 5).map((i, idx) => (
            <p key={idx} className="text-muted">
              • {i.qty !== 1 ? `${i.qty}× ` : ''}
              {i.name} {formatMoney(String(i.price))}
            </p>
          ))}
          {attached.items.length > 5 && <p className="text-muted">… +{attached.items.length - 5} item lain</p>}
          {attached.notes.map((n) => (
            <p key={n} className="text-warning">
              ℹ️ {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
