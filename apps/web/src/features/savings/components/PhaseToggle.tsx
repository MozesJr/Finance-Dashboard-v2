import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useUpdatePlan } from '../hooks';
import { PHASE_LABEL } from '../status';

interface Props {
  activePhase: number;
  /** Dipicu dari banner saran: buka konfirmasi untuk fase ini. */
  requestedPhase?: number | null;
  onRequestHandled?: () => void;
}

export function PhaseToggle({ activePhase, requestedPhase, onRequestHandled }: Props) {
  const [pending, setPending] = useState<number | null>(null);
  const update = useUpdatePlan();
  const target = requestedPhase ?? pending;

  const close = () => {
    setPending(null);
    onRequestHandled?.();
  };

  const confirm = () => {
    if (target === null) return;
    update.mutate(
      { activePhase: target },
      {
        onSuccess: () => toast.success(`Beralih ke ${PHASE_LABEL[target]}`),
        onError: (e) => toast.error(getErrorMessage(e)),
        onSettled: close,
      },
    );
  };

  return (
    <>
      <div role="radiogroup" aria-label="Fase alokasi" className="inline-flex flex-wrap gap-1 rounded-md border border-line p-1">
        {[1, 2].map((phase) => (
          <button
            key={phase}
            role="radio"
            aria-checked={activePhase === phase}
            onClick={() => activePhase !== phase && setPending(phase)}
            className={cn(
              'rounded px-3 py-1.5 text-sm transition-colors',
              activePhase === phase ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
            )}
          >
            {PHASE_LABEL[phase]}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={target !== null}
        title={`Beralih ke ${target !== null ? PHASE_LABEL[target] : ''}?`}
        description="Porsi alokasi bulan ini akan mengikuti fase yang dipilih. Data transaksi dan tabungan tidak berubah."
        confirmLabel="Ya, beralih"
        loading={update.isPending}
        onConfirm={confirm}
        onCancel={close}
      />
    </>
  );
}
