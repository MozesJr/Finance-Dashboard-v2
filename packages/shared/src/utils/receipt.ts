import type { ReceiptExtraction } from '../schemas/ai';

export interface SanitizedReceipt {
  merchant: string | null;
  /** YYYY-MM-DD, tidak pernah di masa depan. */
  date: string;
  total: bigint;
  items: ReceiptExtraction['items'];
  paymentMethod: string | null;
  /** Catatan untuk user (selisih item, tanggal diganti, dst). */
  notes: string[];
}

export type SanitizeResult = { ok: true; receipt: SanitizedReceipt } | { ok: false; message: string };

const ITEM_TOTAL_TOLERANCE_PERCENT = 5n;

/**
 * Pemeriksaan kewajaran hasil ekstraksi struk (murni):
 * total harus > 0; tanggal kosong/masa depan → hari ini; selisih jumlah item vs total > 5% → catatan (total tetap dipakai).
 */
export function sanitizeReceipt(extraction: ReceiptExtraction, today: string): SanitizeResult {
  if (!Number.isInteger(extraction.total) || extraction.total <= 0) {
    return { ok: false, message: 'Total pada struk tidak terbaca. Coba foto yang lebih jelas atau catat manual.' };
  }
  const total = BigInt(extraction.total);
  const notes: string[] = [];

  let date = extraction.date;
  if (!date) {
    date = today;
    notes.push('Tanggal struk tidak terbaca, memakai hari ini.');
  } else if (date > today) {
    notes.push(`Tanggal struk (${date}) di masa depan, diganti hari ini.`);
    date = today;
  }

  if (extraction.items.length > 0) {
    const itemsSum = extraction.items.reduce((acc, i) => acc + BigInt(i.price), 0n);
    const diff = itemsSum > total ? itemsSum - total : total - itemsSum;
    if (diff * 100n > total * ITEM_TOTAL_TOLERANCE_PERCENT) {
      notes.push(`Jumlah item (${itemsSum}) berbeda dari total (${total}); memakai total struk.`);
    }
  }

  return {
    ok: true,
    receipt: {
      merchant: extraction.merchant && extraction.merchant.trim() !== '' ? extraction.merchant.trim() : null,
      date,
      total,
      items: extraction.items,
      paymentMethod: extraction.paymentMethod,
      notes,
    },
  };
}
