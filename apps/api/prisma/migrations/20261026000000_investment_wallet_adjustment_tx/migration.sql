-- Fitur A (Investasi): hanya menambah dua nilai enum. Tidak ada kolom/tabel baru, tidak ada data yang diubah.
ALTER TYPE "WalletType" ADD VALUE 'INVESTMENT';
ALTER TYPE "TxType" ADD VALUE 'ADJUSTMENT';
