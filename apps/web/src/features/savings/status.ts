import type { AllocationStatus } from './api';

export const STATUS_LABEL: Record<AllocationStatus, string> = {
  BELUM_ADA: 'Belum ada',
  AMAN: 'Aman',
  HAMPIR: 'Hampir habis',
  LEBIH: 'Melebihi',
  KURANG: 'Kurang',
  TERCAPAI: 'Tercapai',
};

/** Kelas token Tailwind per status (teks dan bar). */
export const STATUS_TEXT: Record<AllocationStatus, string> = {
  BELUM_ADA: 'text-muted',
  AMAN: 'text-income',
  HAMPIR: 'text-warning',
  LEBIH: 'text-expense',
  KURANG: 'text-warning',
  TERCAPAI: 'text-income',
};

export const STATUS_BAR: Record<AllocationStatus, string> = {
  BELUM_ADA: 'bg-muted',
  AMAN: 'bg-income',
  HAMPIR: 'bg-warning',
  LEBIH: 'bg-expense',
  KURANG: 'bg-warning',
  TERCAPAI: 'bg-income',
};

export const PHASE_LABEL: Record<number, string> = {
  1: 'Fase 1 — Isi Dana Darurat',
  2: 'Fase 2 — Investasi Penuh',
};
