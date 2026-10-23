const QUESTION_PREFIXES = [
  'apa', 'apakah', 'berapa', 'kapan', 'kenapa', 'mengapa', 'gimana', 'bagaimana', 'piye', 'pinten',
  'siapa', 'dimana', 'di mana', 'kemana', 'ke mana', 'mana',
];

/** Nominal "tegas" (bersatuan atau berawalan Rp), bukan angka polos seperti tahun. */
const STRONG_AMOUNT = /\brp\.?\s*\d|\d(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta)\b/i;

/** Pesan berbentuk pertanyaan: diawali kata tanya atau diakhiri "?". */
export function isQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t === '') return false;
  if (t.endsWith('?')) return true;
  return QUESTION_PREFIXES.some((p) => t === p || t.startsWith(`${p} `));
}

/**
 * Arahkan ke chat AI (bukan parser transaksi) bila pesan berbentuk pertanyaan
 * dan tidak memuat nominal tegas ("35rb", "Rp 1.2jt"). Angka polos (mis. tahun 2026) tidak dihitung.
 */
export function shouldRouteToChat(text: string): boolean {
  return isQuestion(text) && !STRONG_AMOUNT.test(text);
}
