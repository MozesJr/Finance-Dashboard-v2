export const HELP_TEXT = [
  '🤖 Bot Finance — catat keuangan lewat chat',
  '',
  'Kirim transaksi, mis.:',
  '• makan siang 35rb',
  '• gaji 8,5jt',
  '• kemarin parkir 5000',
  '• transfer 500rb bca ke gopay',
  '(banyak baris = banyak transaksi)',
  '',
  'Tanya AI: /tanya berapa pengeluaranku bulan ini?',
  'Insight bulanan: /insight',
  'Investasi: /investasi · perbarui nilai: update ipot 8,7jt',
  '',
  '/saldo /hariini /bulanini /alokasi /tabungan /investasi',
  '/undo /batal /unlink /help',
].join('\n');

export const START_UNLINKED = [
  '👋 Halo! Aku bot pencatat keuangan.',
  '',
  'Hubungkan akunmu dulu:',
  '1. Buka web → Pengaturan → Telegram → Hubungkan',
  '2. Kirim ke sini: /link 123456 (kode dari web)',
].join('\n');

export const NOT_LINKED = 'Akun belum terhubung. Buka web → Pengaturan → Telegram → Hubungkan, lalu kirim /link <kode>.';

export const STATUS_BLOCKED: Record<string, string> = {
  PENDING: 'Akunmu masih menunggu persetujuan admin, jadi belum bisa dipakai.',
  REJECTED: 'Pendaftaran akunmu ditolak, jadi bot tidak bisa dipakai.',
  SUSPENDED: 'Akunmu sedang ditangguhkan. Hubungi admin untuk informasi lebih lanjut.',
};
