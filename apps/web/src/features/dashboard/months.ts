const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** "2026-10" → "Okt 26" */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** "2026-10" → "Oktober 2026" */
export function fullMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${FULL[Number(m) - 1]} ${y}`;
}
