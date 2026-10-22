export const WALLET_TYPE_LABELS = { CASH: 'Tunai', BANK: 'Bank', EWALLET: 'E-wallet' } as const;
export const walletTypeLabel = (type: keyof typeof WALLET_TYPE_LABELS) => WALLET_TYPE_LABELS[type];
