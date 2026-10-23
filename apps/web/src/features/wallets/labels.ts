export const WALLET_TYPE_LABELS = { CASH: 'Tunai', BANK: 'Bank', EWALLET: 'E-wallet', INVESTMENT: 'Investasi' } as const;
export const walletTypeLabel = (type: keyof typeof WALLET_TYPE_LABELS) => WALLET_TYPE_LABELS[type];

/** "+1,23%" / "-13%" (koma desimal Indonesia); null → "". */
export function formatPct(value: number | null): string {
  if (value === null) return '';
  const text = String(Math.abs(value)).replace('.', ',');
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${text}%`;
}

/** "+Rp1.000" / "-Rp1.000" / "Rp0" untuk untung/rugi. */
export function formatSigned(value: string, format: (v: string) => string): string {
  return `${BigInt(value) > 0n ? '+' : ''}${format(value)}`;
}
