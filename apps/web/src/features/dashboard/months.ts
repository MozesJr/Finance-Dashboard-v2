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

/** ("2026-10-25", "2026-11-24") → "25 Okt – 24 Nov" */
export function shortRangeLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}
