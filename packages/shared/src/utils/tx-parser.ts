import { parseNominal } from './money';

/**
 * Parser transaksi berbasis aturan (murni, tanpa I/O) untuk input teks bot.
 * Contoh: "makan siang 35rb", "gaji 8,5jt", "tuku kopi 18rb gopay",
 * "kemarin parkir 5000", "transfer 500rb bca ke gopay".
 */

export interface ParserWallet {
  id: string;
  name: string;
}

export interface ParseContext {
  /** Tanggal hari ini (Asia/Jakarta) format YYYY-MM-DD. */
  today: string;
  wallets: ParserWallet[];
}

export type ParseFailureReason = 'EMPTY' | 'NO_AMOUNT' | 'AMOUNT_TOO_SMALL' | 'AMBIGUOUS_AMOUNT' | 'TRANSFER_WALLETS';

export interface ParsedTransaction {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: bigint;
  /** YYYY-MM-DD */
  date: string;
  dateExplicit: boolean;
  walletId: string | null;
  toWalletId: string | null;
  /** Teks sisa setelah nominal, tanggal, dan dompet dibuang. */
  description: string;
  /** Huruf kecil tanpa tanda baca, untuk pencocokan kategori/rule. */
  normalized: string;
}

export type ParseResult =
  | { ok: true; tx: ParsedTransaction }
  | { ok: false; reason: ParseFailureReason; message: string };

export interface CategoryRule {
  pattern: string;
  categoryId: string;
}

// ---------------------------------------------------------------- util

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'beli', 'bayar', 'tuku', 'di', 'ke', 'dari', 'untuk', 'buat', 'sama', 'dan', 'yang', 'pakai', 'pake', 'via',
  'dengan', 'dgn', 'sm', 'utk', 'nya', 'lewat', 'tadi', 'ini', 'itu',
]);

/** Kunci pembelajaran rule dari teks ternormalisasi: buang kata sambung & angka. null jika kosong. */
export function extractRuleKey(normalized: string): string | null {
  const words = normalized.split(' ').filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return words.length === 0 ? null : words.slice(0, 4).join(' ');
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, pebruari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8, agst: 8, ags: 8, september: 9, sep: 9,
  sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, nop: 11, desember: 12, des: 12,
};

// ---------------------------------------------------------------- tokens

interface Token {
  raw: string;
  low: string;
  used: boolean;
}

const edge = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function tokenize(line: string): Token[] {
  const work = line
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)\s+(rb|ribu|k|jt|juta)\b/gi, '$1$2')
    .replace(/\brp\.?\s*(?=\d)/gi, 'rp');
  return work
    .split(' ')
    .filter(Boolean)
    .map((raw) => ({ raw, low: raw.toLowerCase().replace(edge, ''), used: false }))
    .filter((t) => t.low !== '');
}

// ---------------------------------------------------------------- tanggal

interface DateHit {
  date: string;
}

function parseDate(tokens: Token[], today: string): DateHit | null {
  const [ty, tm] = today.split('-').map(Number);
  const at = (i: number) => tokens[i]?.low;
  const use = (...idx: number[]) => idx.forEach((i) => (tokens[i].used = true));

  for (let i = 0; i < tokens.length; i++) {
    const w = at(i);
    const next = at(i + 1);

    // "12 agustus"
    if (/^\d{1,2}$/.test(w) && next && MONTHS[next] !== undefined) {
      const day = Number(w);
      const month = MONTHS[next];
      let year = ty;
      if (validDate(year, month, day) && `${year}-${pad(month)}-${pad(day)}` > today) year -= 1;
      if (validDate(year, month, day)) {
        use(i, i + 1);
        return { date: `${year}-${pad(month)}-${pad(day)}` };
      }
    }

    // "tgl 12" / "tanggal 12"
    if ((w === 'tgl' || w === 'tanggal') && next && /^\d{1,2}$/.test(next)) {
      const day = Number(next);
      let y = ty;
      let m = tm;
      if (validDate(y, m, day) && `${y}-${pad(m)}-${pad(day)}` > today) {
        m -= 1;
        if (m === 0) {
          m = 12;
          y -= 1;
        }
      }
      if (validDate(y, m, day)) {
        use(i, i + 1);
        return { date: `${y}-${pad(m)}-${pad(day)}` };
      }
    }

    // "lusa kemarin" / "kemarin lusa"
    if ((w === 'lusa' && next === 'kemarin') || (w === 'kemarin' && next === 'lusa')) {
      use(i, i + 1);
      return { date: addDays(today, -2) };
    }

    // "2 hari lalu" / "2 hari yang lalu"
    if (/^\d{1,2}$/.test(w) && next === 'hari' && (at(i + 2) === 'lalu' || (at(i + 2) === 'yang' && at(i + 3) === 'lalu'))) {
      const n = Number(w);
      if (n >= 1 && n <= 60) {
        use(i, i + 1, i + 2);
        if (at(i + 2) === 'yang') use(i + 3);
        return { date: addDays(today, -n) };
      }
    }

    if (w === 'kemarin') {
      use(i);
      return { date: addDays(today, -1) };
    }
    if (w === 'hari' && next === 'ini') {
      use(i, i + 1);
      return { date: today };
    }
    if (w === 'tadi' || w === 'td' || w === 'barusan') {
      use(i);
      return { date: today };
    }
  }
  return null;
}

// ---------------------------------------------------------------- nominal

const QUANTITY_WORDS = new Set([
  'porsi', 'pcs', 'biji', 'buah', 'gelas', 'bungkus', 'orang', 'x', 'kali', 'hari', 'bulan', 'minggu', 'kg',
  'gram', 'liter', 'botol', 'lembar', 'potong', 'cup', 'item',
]);
const NON_AMOUNT_PREV = new Set(['tgl', 'tanggal', 'jam', 'pukul', 'no', 'nomor']);
const AMOUNT_RE = /^(rp)?(\d[\d.,]*\d|\d)(rb|ribu|k|jt|juta|m)?$/;

interface AmountCandidate {
  index: number;
  value: bigint;
  strength: 'strong' | 'medium' | 'weak';
}

function findAmount(tokens: Token[]): { ok: true; index: number; value: bigint } | { ok: false; reason: ParseFailureReason } {
  const candidates: AmountCandidate[] = [];
  tokens.forEach((t, index) => {
    if (t.used) return;
    const m = AMOUNT_RE.exec(t.low);
    if (!m) return;
    const prev = tokens[index - 1]?.low;
    const next = tokens[index + 1]?.low;
    if (prev && NON_AMOUNT_PREV.has(prev)) return;
    if (next && QUANTITY_WORDS.has(next)) return;
    let value: bigint;
    try {
      value = parseNominal(t.low);
    } catch {
      return;
    }
    const strong = Boolean(m[1] || m[3]);
    candidates.push({ index, value, strength: strong ? 'strong' : value >= 1000n ? 'medium' : 'weak' });
  });

  for (const level of ['strong', 'medium'] as const) {
    const pool = candidates.filter((c) => c.strength === level && c.value > 0n);
    if (pool.length === 0) continue;
    const distinct = new Set(pool.map((c) => c.value.toString()));
    if (distinct.size > 1) return { ok: false, reason: 'AMBIGUOUS_AMOUNT' };
    return { ok: true, index: pool[0].index, value: pool[0].value };
  }
  return { ok: false, reason: candidates.length > 0 ? 'AMOUNT_TOO_SMALL' : 'NO_AMOUNT' };
}

// ---------------------------------------------------------------- tipe

const TRANSFER_WORDS = new Set(['transfer', 'tf', 'trf', 'pindah', 'pindahkan', 'mutasi']);
const INCOME_MARKERS = new Set(['masuk', 'terima', 'diterima', 'menerima']);
const INCOME_WORDS = new Set([
  'gaji', 'gajian', 'bonus', 'thr', 'dapat', 'dapet', 'pemasukan', 'income', 'cashback', 'refund', 'dividen',
  'komisi', 'upah', 'honor', 'fee', 'masuk', 'terima', 'diterima', 'menerima', 'freelance', 'salary', 'payout',
]);

// ---------------------------------------------------------------- dompet

const WALLET_STOP = new Set(['dompet', 'rekening', 'bank', 'e', 'wallet', 'tabungan', 'kartu', 'akun']);
const ALIAS_GROUPS: string[][] = [
  ['tunai', 'cash', 'kas'],
  ['gopay', 'gp'],
  ['shopeepay', 'spay', 'shopee'],
  ['mandiri', 'livin'],
  ['bri', 'brimo'],
  ['bca', 'mbca'],
  ['jenius', 'btpn'],
  ['linkaja', 'link'],
];

function buildWalletTokenMap(wallets: ParserWallet[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (token: string, id: string) => {
    if (!map.has(token)) map.set(token, new Set());
    map.get(token)?.add(id);
  };
  for (const w of wallets) {
    const tokens = normalizeText(w.name)
      .split(' ')
      .filter((t) => t && !WALLET_STOP.has(t));
    for (const t of tokens) {
      add(t, w.id);
      for (const group of ALIAS_GROUPS) {
        if (group.includes(t)) group.forEach((alias) => add(alias, w.id));
      }
    }
  }
  return map;
}

const WALLET_PREPOSITIONS = new Set(['pakai', 'pake', 'via', 'lewat', 'dari', 'dgn', 'dengan', 'di', 'from', 'ke']);

// ---------------------------------------------------------------- parser

function fail(reason: ParseFailureReason, message: string): ParseResult {
  return { ok: false, reason, message };
}

export function parseTransactionLine(line: string, ctx: ParseContext): ParseResult {
  const tokens = tokenize(line);
  if (tokens.length === 0) return fail('EMPTY', 'Pesan kosong.');

  // 1. tanggal
  const dateHit = parseDate(tokens, ctx.today);

  // 2. nominal
  const amount = findAmount(tokens);
  if (!amount.ok) {
    const messages: Record<ParseFailureReason, string> = {
      EMPTY: 'Pesan kosong.',
      NO_AMOUNT: 'Nominal tidak ditemukan. Contoh: "makan siang 35rb".',
      AMOUNT_TOO_SMALL: 'Nominal kurang jelas. Tulis dengan satuan, mis. 35rb, 1,2jt, atau 35000.',
      AMBIGUOUS_AMOUNT: 'Ada lebih dari satu nominal. Kirim satu transaksi per baris.',
      TRANSFER_WALLETS: '',
    };
    return fail(amount.reason, messages[amount.reason]);
  }
  tokens[amount.index].used = true;

  // 3. tipe
  const lows = tokens.map((t) => t.low);
  const hasTransferWord = lows.some((w) => TRANSFER_WORDS.has(w));
  const hasKe = lows.includes('ke');
  const hasIncomeMarker = lows.some((w) => INCOME_MARKERS.has(w));
  let type: ParsedTransaction['type'] = 'EXPENSE';
  if (hasTransferWord && hasKe && !hasIncomeMarker) type = 'TRANSFER';
  else if (lows.some((w) => INCOME_WORDS.has(w)) || (hasTransferWord && lows.includes('dari'))) type = 'INCOME';

  // 4. dompet
  const walletMap = buildWalletTokenMap(ctx.wallets);
  const hits: Array<{ index: number; walletId: string }> = [];
  tokens.forEach((t, index) => {
    if (t.used) return;
    const ids = walletMap.get(t.low);
    if (ids && ids.size === 1) hits.push({ index, walletId: [...ids][0] });
  });

  let walletId: string | null = null;
  let toWalletId: string | null = null;

  if (type === 'TRANSFER') {
    const keIndex = lows.indexOf('ke');
    const to = hits.find((h) => lows[h.index - 1] === 'ke') ?? hits.find((h) => h.index > keIndex);
    const from =
      hits.find((h) => lows[h.index - 1] === 'dari') ?? hits.find((h) => h.index < keIndex && h.walletId !== to?.walletId);
    if (!from || !to || from.walletId === to.walletId) {
      return fail('TRANSFER_WALLETS', 'Transfer: sebutkan dompet asal dan tujuan, mis. "transfer 500rb bca ke gopay".');
    }
    walletId = from.walletId;
    toWalletId = to.walletId;
    hits.forEach((h) => (tokens[h.index].used = true));
    tokens.forEach((t) => {
      if (TRANSFER_WORDS.has(t.low) || t.low === 'ke' || t.low === 'dari') t.used = true;
    });
  } else if (hits.length > 0) {
    walletId = hits[0].walletId;
    for (const h of hits) {
      tokens[h.index].used = true;
      const prev = tokens[h.index - 1];
      if (prev && !prev.used && WALLET_PREPOSITIONS.has(prev.low)) prev.used = true;
    }
  }

  // 5. deskripsi
  let description = tokens
    .filter((t) => !t.used)
    .map((t) => t.raw)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (description === '' && type === 'TRANSFER') description = 'Transfer';

  return {
    ok: true,
    tx: {
      type,
      amount: amount.value,
      date: dateHit?.date ?? ctx.today,
      dateExplicit: dateHit !== null,
      walletId,
      toWalletId,
      description,
      normalized: normalizeText(description),
    },
  };
}

/** Pesan multi-baris → satu hasil per baris tidak kosong. */
export function parseTransactionMessage(text: string, ctx: ParseContext): Array<{ line: string; result: ParseResult }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => ({ line, result: parseTransactionLine(line, ctx) }));
}

// ---------------------------------------------------------------- kategori

/** Kata kunci default per ID kategori sistem (seed). `weak` hanya dipakai bila tidak ada kecocokan kuat. */
interface KeywordEntry {
  categoryId: string;
  strong: string[];
  weak?: string[];
}

const EXPENSE_KEYWORDS: KeywordEntry[] = [
  {
    categoryId: 'cat-expense-makan',
    strong: [
      'makan', 'minum', 'kopi', 'ngopi', 'nasi', 'warung', 'warteg', 'resto', 'restoran', 'cafe', 'kafe', 'bakso',
      'mie', 'mi', 'soto', 'sate', 'ayam', 'jajan', 'snack', 'camilan', 'mangan', 'mamam', 'lunch', 'dinner',
      'sarapan', 'gofood', 'grabfood', 'shopeefood', 'boba', 'teh', 'es', 'roti', 'martabak', 'seblak', 'kantin',
      'starbucks', 'mcd', 'kfc', 'burger', 'pizza', 'padang', 'gado', 'lalapan', 'minuman', 'nongkrong',
    ],
  },
  {
    categoryId: 'cat-expense-transport',
    strong: [
      'bensin', 'pertamax', 'pertalite', 'solar', 'parkir', 'tol', 'gojek', 'grab', 'ojek', 'ojol', 'taksi',
      'taxi', 'bus', 'krl', 'kereta', 'mrt', 'lrt', 'angkot', 'transjakarta', 'busway', 'maxim', 'indriver', 'bbm',
      'servis', 'tambal',
    ],
  },
  {
    categoryId: 'cat-expense-listrik',
    strong: ['listrik', 'pln', 'pdam'],
  },
  {
    categoryId: 'cat-expense-internet',
    strong: ['pulsa', 'kuota', 'wifi', 'internet', 'indihome', 'paket data'],
  },
  {
    categoryId: 'cat-expense-kos',
    strong: ['kos', 'kost', 'sewa', 'kontrakan', 'kontrak', 'apartemen'],
  },
  {
    categoryId: 'cat-expense-kesehatan',
    strong: ['obat', 'apotek', 'apotik', 'dokter', 'rs', 'rumah sakit', 'klinik', 'vitamin', 'bpjs', 'periksa'],
  },
  {
    categoryId: 'cat-expense-donasi',
    strong: ['perpuluhan', 'persembahan', 'donasi', 'sedekah', 'zakat', 'infaq', 'infak', 'amal', 'kolekte'],
  },
  {
    categoryId: 'cat-expense-hiburan',
    strong: ['nonton', 'bioskop', 'netflix', 'spotify', 'game', 'konser', 'karaoke', 'youtube', 'disney', 'steam'],
  },
  {
    categoryId: 'cat-expense-hobi',
    strong: ['hobi', 'gym', 'olahraga', 'futsal', 'mancing', 'sepeda', 'pancing'],
  },
  {
    categoryId: 'cat-expense-pendidikan',
    strong: ['sekolah', 'kuliah', 'spp', 'kursus', 'les', 'ukt', 'seminar', 'workshop', 'buku'],
  },
  {
    categoryId: 'cat-expense-belanja',
    strong: [
      'belanja', 'indomaret', 'alfamart', 'supermarket', 'minimarket', 'sabun', 'shampo', 'sampo', 'sembako',
      'pasar', 'deterjen', 'tisu', 'galon', 'gas', 'elpiji', 'odol',
    ],
    weak: ['tuku', 'beli'],
  },
];

const INCOME_KEYWORDS: KeywordEntry[] = [
  { categoryId: 'cat-income-gaji', strong: ['gaji', 'gajian', 'salary'] },
  { categoryId: 'cat-income-bonus', strong: ['bonus', 'thr', 'insentif', 'hadiah'] },
  { categoryId: 'cat-income-freelance', strong: ['freelance', 'proyek', 'project', 'fee', 'honor', 'komisi', 'upah'] },
  { categoryId: 'cat-income-investasi', strong: ['dividen', 'bunga', 'investasi', 'profit', 'kupon'] },
];

function hasPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

/**
 * Sarankan kategori: (1) rule milik user (pola terpanjang menang),
 * (2) kata kunci default (kuat dulu, lalu lemah). null bila tidak yakin.
 */
export function suggestCategoryId(
  normalized: string,
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  rules: CategoryRule[] = [],
): { categoryId: string; source: 'RULE' | 'KEYWORD' } | null {
  if (type === 'TRANSFER' || normalized === '') return null;

  const matched = rules
    .filter((r) => r.pattern && hasPhrase(normalized, r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  if (matched.length > 0) return { categoryId: matched[0].categoryId, source: 'RULE' };

  const table = type === 'INCOME' ? INCOME_KEYWORDS : EXPENSE_KEYWORDS;
  for (const entry of table) {
    if (entry.strong.some((k) => hasPhrase(normalized, k))) return { categoryId: entry.categoryId, source: 'KEYWORD' };
  }
  for (const entry of table) {
    if (entry.weak?.some((k) => hasPhrase(normalized, k))) return { categoryId: entry.categoryId, source: 'KEYWORD' };
  }
  return null;
}
