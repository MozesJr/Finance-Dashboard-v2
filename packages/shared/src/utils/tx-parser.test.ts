import { describe, it, expect } from 'vitest';
import {
  extractRuleKey,
  normalizeText,
  parseTransactionLine,
  parseTransactionMessage,
  suggestCategoryId,
  type ParsedTransaction,
  type ParseContext,
} from './tx-parser';

const W_TUNAI = 'w-tunai';
const W_BCA = 'w-bca';
const W_GOPAY = 'w-gopay';
const W_OVO = 'w-ovo';
const W_DANA = 'w-dana';

// Jumat, 23 Okt 2026
const ctx: ParseContext = {
  today: '2026-10-23',
  wallets: [
    { id: W_TUNAI, name: 'Dompet Tunai' },
    { id: W_BCA, name: 'BCA' },
    { id: W_GOPAY, name: 'GoPay' },
    { id: W_OVO, name: 'OVO' },
    { id: W_DANA, name: 'Dana' },
  ],
};

function ok(line: string, c: ParseContext = ctx): ParsedTransaction {
  const r = parseTransactionLine(line, c);
  if (!r.ok) throw new Error(`gagal parse "${line}": ${r.reason}`);
  return r.tx;
}
const category = (tx: ParsedTransaction) => suggestCategoryId(tx.normalized, tx.type)?.categoryId ?? null;

describe('parseTransactionLine - nominal', () => {
  it('"makan siang 35rb" → pengeluaran 35.000, hari ini, kategori Makan', () => {
    const tx = ok('makan siang 35rb');
    expect(tx).toMatchObject({ type: 'EXPENSE', amount: 35_000n, date: '2026-10-23', dateExplicit: false, walletId: null, description: 'makan siang' });
    expect(category(tx)).toBe('cat-expense-makan');
  });

  it('"bensin 20k" → 20.000, Transportasi', () => {
    const tx = ok('bensin 20k');
    expect(tx.amount).toBe(20_000n);
    expect(category(tx)).toBe('cat-expense-transport');
  });

  it('"gaji 8,5jt" → pemasukan 8.500.000, kategori Gaji', () => {
    const tx = ok('gaji 8,5jt');
    expect(tx).toMatchObject({ type: 'INCOME', amount: 8_500_000n });
    expect(category(tx)).toBe('cat-income-gaji');
  });

  it('format Rp dan titik ribuan: "Rp 35.000 kopi", "indomaret 78.500", "bayar listrik 1.250.000"', () => {
    expect(ok('Rp 35.000 kopi').amount).toBe(35_000n);
    expect(ok('indomaret 78.500').amount).toBe(78_500n);
    const tx = ok('bayar listrik 1.250.000');
    expect(tx.amount).toBe(1_250_000n);
    expect(category(tx)).toBe('cat-expense-listrik');
  });

  it('satuan terpisah spasi: "kopi 35 rb", "ngopi 2,5 jt"', () => {
    expect(ok('kopi 35 rb').amount).toBe(35_000n);
    expect(ok('beli laptop 2,5 jt').amount).toBe(2_500_000n);
  });

  it('angka polos ≥ 1000 diterima: "parkir 5000"', () => {
    expect(ok('parkir 5000').amount).toBe(5_000n);
  });

  it('jumlah barang tidak dianggap nominal: "nasi padang 2 porsi 40rb", "beli 3 kopi 54rb"', () => {
    expect(ok('nasi padang 2 porsi 40rb').amount).toBe(40_000n);
    expect(ok('beli 3 kopi 54rb').amount).toBe(54_000n);
  });

  it('nominal sangat besar tetap exact (BigInt)', () => {
    expect(ok('gaji 9007199254740993').amount).toBe(9_007_199_254_740_993n);
  });
});

describe('parseTransactionLine - kegagalan', () => {
  const reason = (line: string) => {
    const r = parseTransactionLine(line, ctx);
    return r.ok ? 'OK' : r.reason;
  };

  it('tanpa nominal → NO_AMOUNT', () => {
    expect(reason('kopi')).toBe('NO_AMOUNT');
    expect(reason('tuku bakso enak banget')).toBe('NO_AMOUNT');
  });

  it('angka polos kecil → AMOUNT_TOO_SMALL (bukan ditebak)', () => {
    expect(reason('kopi 18')).toBe('AMOUNT_TOO_SMALL');
  });

  it('dua nominal berbeda → AMBIGUOUS_AMOUNT', () => {
    expect(reason('makan 35rb 20rb')).toBe('AMBIGUOUS_AMOUNT');
  });

  it('kosong → EMPTY', () => {
    expect(reason('   ')).toBe('EMPTY');
  });

  it('nominal nol ditolak', () => {
    expect(reason('kopi 0rb')).not.toBe('OK');
  });
});

describe('parseTransactionLine - tanggal', () => {
  it('"kemarin parkir 5000" → 22 Okt', () => {
    expect(ok('kemarin parkir 5000')).toMatchObject({ date: '2026-10-22', dateExplicit: true, description: 'parkir' });
  });

  it('"lusa kemarin ngopi 25rb" dan "kemarin lusa" → 21 Okt', () => {
    expect(ok('lusa kemarin ngopi 25rb').date).toBe('2026-10-21');
    expect(ok('ngopi 25rb kemarin lusa').date).toBe('2026-10-21');
  });

  it('"3 hari lalu", "2 hari yang lalu"', () => {
    expect(ok('makan 30rb 3 hari lalu').date).toBe('2026-10-20');
    expect(ok('makan 30rb 2 hari yang lalu').date).toBe('2026-10-21');
  });

  it('"tadi" / "hari ini" tetap hari ini tetapi eksplisit', () => {
    expect(ok('makan siang 35rb tadi')).toMatchObject({ date: '2026-10-23', dateExplicit: true, description: 'makan siang' });
    expect(ok('hari ini kopi 18rb').dateExplicit).toBe(true);
  });

  it('"tgl 12" → bulan ini; "tanggal 25" yang belum terjadi → bulan lalu', () => {
    expect(ok('tgl 12 makan 30rb').date).toBe('2026-10-12');
    expect(ok('tanggal 25 bayar kos 1,5jt').date).toBe('2026-09-25');
  });

  it('"12 agustus beli buku 85rb" → 12 Agu 2026; bulan di depan → tahun lalu', () => {
    expect(ok('12 agustus beli buku 85rb').date).toBe('2026-08-12');
    expect(ok('5 des beli buku 85rb').date).toBe('2025-12-05');
  });

  it('tanggal "tgl 12" tidak dianggap nominal', () => {
    expect(ok('tgl 12 kopi 18rb').amount).toBe(18_000n);
  });

  it('lintas tahun: "tgl 31" pada 5 Jan → 31 Des tahun lalu', () => {
    expect(ok('tgl 31 kopi 18rb', { ...ctx, today: '2026-01-05' }).date).toBe('2025-12-31');
  });
});

describe('parseTransactionLine - tipe', () => {
  it.each([
    ['terima bonus 2jt', 'cat-income-bonus'],
    ['dapat thr 1jt', 'cat-income-bonus'],
    ['kemarin gajian 5jt', 'cat-income-gaji'],
    ['freelance proyek logo 2,5jt', 'cat-income-freelance'],
    ['dividen saham 300rb', 'cat-income-investasi'],
  ])('pemasukan: %s', (line, cat) => {
    const tx = ok(line);
    expect(tx.type).toBe('INCOME');
    expect(category(tx)).toBe(cat);
  });

  it('"transfer masuk 300rb" dan "uang masuk dari ayah 500rb" → INCOME', () => {
    expect(ok('transfer masuk 300rb').type).toBe('INCOME');
    const tx = ok('uang masuk dari ayah 500rb');
    expect(tx.type).toBe('INCOME');
    expect(category(tx)).toBeNull(); // tidak yakin → tanya lewat tombol
  });

  it('"grab ke kantor 28rb" (ada kata "ke" tapi bukan transfer) → EXPENSE', () => {
    const tx = ok('grab ke kantor 28rb');
    expect(tx.type).toBe('EXPENSE');
    expect(category(tx)).toBe('cat-expense-transport');
  });

  it('"transfer 500rb" tanpa tujuan → bukan TRANSFER', () => {
    expect(ok('bayar transfer admin 6500').type).toBe('EXPENSE');
  });
});

describe('parseTransactionLine - dompet', () => {
  it('"tuku kopi 18rb gopay" → dompet GoPay, kategori Makan (kata Jawa)', () => {
    const tx = ok('tuku kopi 18rb gopay');
    expect(tx.walletId).toBe(W_GOPAY);
    expect(tx.description).toBe('tuku kopi');
    expect(category(tx)).toBe('cat-expense-makan');
  });

  it('kata depan dompet ikut dibuang: "makan 35rb dari gopay", "gofood 45rb pakai ovo"', () => {
    expect(ok('makan 35rb dari gopay')).toMatchObject({ walletId: W_GOPAY, description: 'makan' });
    expect(ok('gofood 45rb pakai ovo')).toMatchObject({ walletId: W_OVO, description: 'gofood' });
  });

  it('alias: "bayar kos 1jt cash" → Dompet Tunai', () => {
    expect(ok('bayar kos 1jt cash').walletId).toBe(W_TUNAI);
  });

  it('nama dompet beda huruf besar: "gaji 10jt BCA"', () => {
    expect(ok('gaji 10jt BCA').walletId).toBe(W_BCA);
  });

  it('tanpa dompet tersebut → null', () => {
    expect(ok('makan 20rb').walletId).toBeNull();
  });
});

describe('parseTransactionLine - transfer', () => {
  it('"transfer 500rb bca ke gopay"', () => {
    expect(ok('transfer 500rb bca ke gopay')).toMatchObject({ type: 'TRANSFER', walletId: W_BCA, toWalletId: W_GOPAY, amount: 500_000n });
  });

  it('"tf 1jt ke dana dari bca"', () => {
    expect(ok('tf 1jt ke dana dari bca')).toMatchObject({ type: 'TRANSFER', walletId: W_BCA, toWalletId: W_DANA });
  });

  it('transfer dengan tanggal: "kemarin tf 200rb tunai ke ovo"', () => {
    expect(ok('kemarin tf 200rb tunai ke ovo')).toMatchObject({ type: 'TRANSFER', walletId: W_TUNAI, toWalletId: W_OVO, date: '2026-10-22' });
  });

  it('dompet sama / tidak dikenal → TRANSFER_WALLETS', () => {
    for (const line of ['transfer 500rb bca ke bca', 'tf 200rb ke xyz', 'transfer 100rb ke gopay']) {
      const r = parseTransactionLine(line, ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('TRANSFER_WALLETS');
    }
  });

  it('transfer tidak punya kategori', () => {
    expect(category(ok('transfer 500rb bca ke gopay'))).toBeNull();
  });
});

describe('parseTransactionMessage - multi baris', () => {
  it('satu hasil per baris, baris gagal dilaporkan', () => {
    const out = parseTransactionMessage('makan 20rb\n\n  bensin 30rb \nngawur', ctx);
    expect(out.map((o) => o.line)).toEqual(['makan 20rb', 'bensin 30rb', 'ngawur']);
    expect(out.map((o) => o.result.ok)).toEqual([true, true, false]);
  });

  it('CRLF dan baris kosong diabaikan', () => {
    expect(parseTransactionMessage('a 10rb\r\nb 20rb\r\n', ctx)).toHaveLength(2);
  });
});

describe('suggestCategoryId - kata kunci', () => {
  it.each([
    ['mangan bakso', 'cat-expense-makan'],
    ['jajan', 'cat-expense-makan'],
    ['ngopi', 'cat-expense-makan'],
    ['gofood ayam geprek', 'cat-expense-makan'],
    ['bayar parkir', 'cat-expense-transport'],
    ['gojek ke kantor', 'cat-expense-transport'],
    ['tagihan pdam', 'cat-expense-listrik'],
    ['token pln', 'cat-expense-listrik'],
    ['beli pulsa', 'cat-expense-internet'],
    ['paket data', 'cat-expense-internet'],
    ['bayar kos', 'cat-expense-kos'],
    ['sewa kontrakan', 'cat-expense-kos'],
    ['beli obat batuk', 'cat-expense-kesehatan'],
    ['netflix', 'cat-expense-hiburan'],
    ['nonton bioskop', 'cat-expense-hiburan'],
    ['sedekah', 'cat-expense-donasi'],
    ['perpuluhan', 'cat-expense-donasi'],
    ['spp sekolah', 'cat-expense-pendidikan'],
    ['alfamart', 'cat-expense-belanja'],
    ['tuku sabun', 'cat-expense-belanja'],
  ])('%s → %s', (text, cat) => {
    expect(suggestCategoryId(normalizeText(text), 'EXPENSE')?.categoryId).toBe(cat);
  });

  it('kata lemah ("tuku") kalah dari kata kuat ("kopi")', () => {
    expect(suggestCategoryId('tuku kopi', 'EXPENSE')?.categoryId).toBe('cat-expense-makan');
    expect(suggestCategoryId('tuku', 'EXPENSE')?.categoryId).toBe('cat-expense-belanja');
  });

  it('pencocokan per kata utuh ("kosmetik" bukan "kos", "grabfood" bukan "grab")', () => {
    expect(suggestCategoryId('kosmetik', 'EXPENSE')).toBeNull();
    expect(suggestCategoryId('grabfood', 'EXPENSE')?.categoryId).toBe('cat-expense-makan');
  });

  it('tidak yakin / transfer → null', () => {
    expect(suggestCategoryId('sesuatu yang aneh', 'EXPENSE')).toBeNull();
    expect(suggestCategoryId('', 'EXPENSE')).toBeNull();
    expect(suggestCategoryId('makan', 'TRANSFER')).toBeNull();
  });
});

describe('suggestCategoryId - rule belajar user', () => {
  it('rule mengalahkan kata kunci default', () => {
    const rules = [{ pattern: 'starbucks', categoryId: 'cat-user-nongkrong' }];
    expect(suggestCategoryId('starbucks kopi', 'EXPENSE', rules)).toEqual({ categoryId: 'cat-user-nongkrong', source: 'RULE' });
    expect(suggestCategoryId('kopi', 'EXPENSE', rules)?.source).toBe('KEYWORD');
  });

  it('pola terpanjang menang', () => {
    const rules = [
      { pattern: 'makan', categoryId: 'a' },
      { pattern: 'makan siang kantor', categoryId: 'b' },
    ];
    expect(suggestCategoryId('makan siang kantor', 'EXPENSE', rules)?.categoryId).toBe('b');
  });

  it('pola harus cocok per kata utuh', () => {
    expect(suggestCategoryId('makanan', 'EXPENSE', [{ pattern: 'makan', categoryId: 'a' }])).toBeNull();
  });
});

describe('extractRuleKey', () => {
  it('membuang kata sambung dan angka', () => {
    expect(extractRuleKey(normalizeText('beli kopi di Starbucks 2'))).toBe('kopi starbucks');
    expect(extractRuleKey('makan siang')).toBe('makan siang');
  });

  it('kosong → null', () => {
    expect(extractRuleKey('beli di')).toBeNull();
    expect(extractRuleKey('')).toBeNull();
  });
});
