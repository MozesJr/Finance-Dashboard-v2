import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getTodayInJakarta, toDateString } from 'shared';
import { AiQuotaError, AiUnavailableError } from '../../ai/ai.errors';
import { UsageMeter } from '../../ai/usage-meter';
import { BotCore } from './bot-core.service';
import { LinkLockout, LINK_LOCK_MS } from './link-lockout';
import { DraftCallbackHandler } from './handlers/draft-callback.handler';
import { InputHandler } from './handlers/input.handler';
import { ReportsHandler } from './handlers/reports.handler';
import { FakeChannelAdapter } from './testing/fake-channel.adapter';

// ------------------------------------------------------------------ dunia palsu (in-memory)

type Status = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED';

interface FakeTx {
  id: string;
  userId: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: bigint;
  status: 'DRAFT' | 'CONFIRMED';
  source: string;
  date: string;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
  merchant: string | null;
  confirmedAt: number;
  aiConfidence: number | null;
}

const WALLETS = [
  { id: 'w-bca', name: 'BCA', balance: '6300000', isDefault: false },
  { id: 'w-gopay', name: 'GoPay', balance: '150000', isDefault: false },
];
const CATEGORIES = [
  { id: 'cat-expense-makan', name: 'Makan & Minum', icon: '🍽️', type: 'EXPENSE' },
  { id: 'cat-expense-transport', name: 'Transportasi', icon: '🚗', type: 'EXPENSE' },
  { id: 'cat-expense-hiburan', name: 'Hiburan', icon: '🎬', type: 'EXPENSE' },
  { id: 'cat-income-gaji', name: 'Gaji', icon: '💼', type: 'INCOME' },
];

function buildWorld(options: { defaultWallet?: string; wallets?: typeof WALLETS } = {}) {
  const wallets = (options.wallets ?? WALLETS).map((w) => ({ ...w, isDefault: w.id === options.defaultWallet }));
  const txs: FakeTx[] = [];
  const rules: Array<{ userId: string; pattern: string; categoryId: string }> = [];
  const pendings = new Map<string, { userId: string; payload: Record<string, unknown> }>();
  const links = new Map<string, { userId: string; status: Status }>();
  const codes = new Map<string, string>(); // kode → userId

  const respond = (t: FakeTx) => {
    const category = CATEGORIES.find((c) => c.id === t.categoryId) ?? null;
    const wallet = wallets.find((w) => w.id === t.walletId) ?? { id: t.walletId, name: '?' };
    const toWallet = wallets.find((w) => w.id === t.toWalletId) ?? null;
    return {
      id: t.id,
      type: t.type,
      amount: t.amount.toString(),
      status: t.status,
      source: t.source,
      date: t.date,
      merchant: t.merchant,
      aiConfidence: t.aiConfidence,
      categoryId: t.categoryId,
      walletId: t.walletId,
      toWalletId: t.toWalletId,
      category: category ? { id: category.id, name: category.name, icon: category.icon, color: null } : null,
      wallet: { id: wallet.id, name: wallet.name, color: null },
      toWallet: toWallet ? { id: toWallet.id, name: toWallet.name, color: null } : null,
    };
  };

  const own = (userId: string, id: string) => {
    const t = txs.find((x) => x.id === id && x.userId === userId);
    if (!t) throw new NotFoundException('Transaksi tidak ditemukan');
    return t;
  };

  const transactions = {
    createDraft: jest.fn(async (userId: string, input: Record<string, unknown>, source: string) => {
      const t: FakeTx = {
        id: randomUUID(),
        userId,
        type: input.type as FakeTx['type'],
        amount: input.amount as bigint,
        status: 'DRAFT',
        source,
        date: input.date as string,
        walletId: input.walletId as string,
        toWalletId: (input.toWalletId as string | null) ?? null,
        categoryId: (input.categoryId as string | null) ?? null,
        merchant: (input.merchant as string | null) ?? null,
        confirmedAt: 0,
        aiConfidence: (input.aiConfidence as number | null) ?? null,
      };
      txs.push(t);
      return respond(t);
    }),
    get: jest.fn(async (userId: string, id: string) => respond(own(userId, id))),
    updateDraft: jest.fn(async (userId: string, id: string, patch: { walletId?: string; categoryId?: string | null; date?: string }) => {
      const t = own(userId, id);
      if (patch.walletId !== undefined) {
        if (t.type === 'TRANSFER' && patch.walletId === t.toWalletId) throw new BadRequestException('Wallet asal dan tujuan tidak boleh sama');
        t.walletId = patch.walletId;
      }
      if (patch.categoryId !== undefined) t.categoryId = patch.categoryId;
      if (patch.date) t.date = patch.date;
      return respond(t);
    }),
    confirmDraft: jest.fn(async (userId: string, id: string) => {
      const t = own(userId, id);
      if (t.status === 'CONFIRMED') return respond(t);
      if (t.type !== 'TRANSFER' && !t.categoryId) throw new BadRequestException('Kategori wajib diisi');
      t.status = 'CONFIRMED';
      t.confirmedAt = Date.now();
      return respond(t);
    }),
    discardDraft: jest.fn(async (userId: string, id: string) => {
      const t = own(userId, id);
      if (t.status !== 'DRAFT') throw new BadRequestException('bukan draft');
      txs.splice(txs.indexOf(t), 1);
    }),
    discardDrafts: jest.fn(async (userId: string, source: string) => {
      const drafts = txs.filter((t) => t.userId === userId && t.source === source && t.status === 'DRAFT');
      drafts.forEach((d) => txs.splice(txs.indexOf(d), 1));
      return drafts.length;
    }),
    findLastConfirmedFrom: jest.fn(async (userId: string, source: string, withinMs: number) => {
      const found = txs
        .filter((t) => t.userId === userId && t.source === source && t.status === 'CONFIRMED' && Date.now() - t.confirmedAt <= withinMs)
        .sort((a, b) => b.confirmedAt - a.confirmedAt)[0];
      return found ? respond(found) : null;
    }),
    remove: jest.fn(async (userId: string, id: string) => {
      const t = own(userId, id);
      txs.splice(txs.indexOf(t), 1);
    }),
  };

  const walletsService = { list: jest.fn(async () => wallets) };
  const categoriesService = { list: jest.fn(async (_u: string, type?: string) => CATEGORIES.filter((c) => !type || c.type === type)) };
  const rulesService = {
    list: jest.fn(async (userId: string) => rules.filter((r) => r.userId === userId).map((r) => ({ pattern: r.pattern, categoryId: r.categoryId }))),
    learn: jest.fn(async (userId: string, pattern: string, categoryId: string) => {
      const existing = rules.find((r) => r.userId === userId && r.pattern === pattern);
      if (existing) existing.categoryId = categoryId;
      else rules.push({ userId, pattern, categoryId });
    }),
  };
  const pending = {
    create: jest.fn(async (userId: string, payload: Record<string, unknown>) => {
      const id = randomUUID();
      pendings.set(id, { userId, payload });
      return id;
    }),
    find: jest.fn(async (userId: string, id: string) => {
      const p = pendings.get(id);
      return p && p.userId === userId ? p.payload : null;
    }),
    delete: jest.fn(async (_u: string, id: string) => void pendings.delete(id)),
    deleteAllForUser: jest.fn(async (userId: string) => {
      let n = 0;
      for (const [id, p] of pendings) {
        if (p.userId !== userId) continue;
        pendings.delete(id);
        n++;
      }
      return n;
    }),
  };
  const linkService = {
    resolveChat: jest.fn(async (chatId: string) => links.get(chatId) ?? null),
    linkByCode: jest.fn(async (code: string, chatId: string) => {
      const userId = codes.get(code.trim());
      if (!userId) return { ok: false, reason: 'INVALID' };
      if (links.has(chatId)) return { ok: false, reason: 'CHAT_TAKEN' };
      links.set(chatId, { userId, status: 'ACTIVE' });
      codes.delete(code.trim());
      return { ok: true, userId };
    }),
    unlinkChat: jest.fn(async (chatId: string) => links.delete(chatId)),
  };
  const dashboard = {
    period: jest.fn(async () => ({
      totalIncome: '5000000',
      totalExpense: '1252500',
      net: '3747500',
      topExpenseCategories: [{ name: 'Makan & Minum', icon: '🍽️', total: '1217500', percent: 97.2 }],
    })),
  };
  const savings = { list: jest.fn(async () => [{ icon: '🛟', name: 'Dana Darurat', collected: '1800000', target: '1500000', percent: 120 }]) };
  const allocation = {
    report: jest.fn(async () => ({
      month: '2026-10',
      phase: 1,
      suggestPhase2: true,
      items: [{ icon: '🏠', name: 'Kebutuhan Primer', dialihkan: false, realized: '1217500', planned: '4500000', status: 'AMAN' }],
    })),
  };

  const ai = {
    available: false,
    parse: jest.fn(async (): Promise<unknown> => {
      throw new AiUnavailableError();
    }),
  };
  const aiUsage = { track: jest.fn(async (_u: string, _f: string, fn: (m: UsageMeter) => Promise<unknown>) => fn(new UsageMeter())) };
  const inputHandler = new InputHandler(
    transactions as never,
    walletsService as never,
    categoriesService as never,
    rulesService as never,
    pending as never,
    ai as never,
    aiUsage as never,
  );
  const callbacks = new DraftCallbackHandler(transactions as never, walletsService as never, categoriesService as never, rulesService as never, pending as never);
  const reports = new ReportsHandler(walletsService as never, dashboard as never, savings as never, allocation as never);
  const lockout = new LinkLockout();
  const core = new BotCore(linkService as never, inputHandler, callbacks, reports, transactions as never, pending as never, lockout);

  const link = (chatId: string, userId: string, status: Status = 'ACTIVE') => links.set(chatId, { userId, status });
  const chat = (chatId: string, userId?: string, status: Status = 'ACTIVE') => {
    if (userId) link(chatId, userId, status);
    return new FakeChannelAdapter(core, chatId);
  };

  return { core, lockout, ai, aiUsage, txs, rules, pendings, links, codes, transactions, linkService, pending, chat, link, dashboard };
}

const today = () => toDateString(getTodayInJakarta());
const yesterday = () => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// ------------------------------------------------------------------ uji

describe('BotCore', () => {
  describe('akses & linking', () => {
    it('chat belum terhubung diminta /link; /start menampilkan cara link', async () => {
      const w = buildWorld();
      const bot = w.chat('c1');
      expect((await bot.say('makan siang 35rb'))[0].text).toContain('/link');
      expect((await bot.say('/start'))[0].text).toContain('Hubungkan akunmu');
      expect(w.txs).toHaveLength(0);
    });

    it('callback dari chat belum terhubung ditolak (mengedit pesan, tidak menyentuh data)', async () => {
      const w = buildWorld();
      const bot = w.chat('c1');
      await bot.press('s:abc');
      expect(bot.last.text).toContain('belum terhubung');
      expect(w.transactions.confirmDraft).not.toHaveBeenCalled();
    });

    it('/link: kode benar menghubungkan; sesudahnya input transaksi dilayani', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.codes.set('123456', 'u1');
      const bot = w.chat('c1');
      expect((await bot.say('/link 123456'))[0].text).toContain('Akun terhubung');
      expect((await bot.say('makan siang 35rb'))[0].text).toContain('Draft transaksi');
    });

    it('/link: kode salah → pesan jelas; 5 kali salah → diblokir sementara walau kode benar', async () => {
      const w = buildWorld();
      w.codes.set('123456', 'u1');
      const bot = w.chat('c1');
      for (let i = 0; i < 5; i++) expect((await bot.say('/link 000000'))[0].text).toContain('tidak valid');
      expect((await bot.say('/link 123456'))[0].text).toContain('Terlalu banyak percobaan');
      expect(w.links.has('c1')).toBe(false);
    });

    it('kunci /link berlaku 15 menit sejak kegagalan ke-5 lalu terbuka sendiri', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-23T10:00:00Z'));
      try {
        const w = buildWorld();
        w.codes.set('123456', 'u1');
        const bot = w.chat('c1');
        for (let i = 0; i < 4; i++) expect((await bot.say('/link 000000'))[0].text).not.toContain('dikunci');
        expect((await bot.say('/link 000000'))[0].text).toContain('dikunci 15 menit');

        jest.setSystemTime(new Date('2026-10-23T10:07:00Z'));
        expect((await bot.say('/link 123456'))[0].text).toContain('Coba lagi dalam 8 menit');
        expect(w.links.has('c1')).toBe(false);

        jest.setSystemTime(new Date(Date.parse('2026-10-23T10:00:00Z') + LINK_LOCK_MS + 1000));
        expect((await bot.say('/link 123456'))[0].text).toContain('Akun terhubung');
      } finally {
        jest.useRealTimers();
      }
    });

    it('admin membuka kunci (unlockChat) → chat bisa /link lagi sebelum 15 menit habis', async () => {
      const w = buildWorld();
      w.codes.set('123456', 'u1');
      const bot = w.chat('c1');
      for (let i = 0; i < 5; i++) await bot.say('/link 000000');
      expect(w.lockout.listLocked()).toHaveLength(1);
      expect((await bot.say('/link 123456'))[0].text).toContain('Terlalu banyak percobaan');

      expect(w.lockout.unlockChat('c1')).toBe(1);
      expect(w.lockout.unlockChat('c1')).toBe(0);
      expect(w.lockout.listLocked()).toHaveLength(0);
      expect((await bot.say('/link 123456'))[0].text).toContain('Akun terhubung');
    });

    it('link berhasil mereset hitungan kegagalan', async () => {
      const w = buildWorld();
      w.codes.set('123456', 'u1');
      const bot = w.chat('c1');
      for (let i = 0; i < 4; i++) await bot.say('/link 000000');
      await bot.say('/link 123456');
      expect(w.lockout.remainingMs(LinkLockout.key('SIMULATOR', 'c1'))).toBe(0);
      await bot.say('/unlink');
      for (let i = 0; i < 4; i++) expect((await bot.say('/link 000000'))[0].text).not.toContain('dikunci');
    });

    it('/link tanpa kode & /unlink', async () => {
      const w = buildWorld();
      const bot = w.chat('c1', 'u1');
      expect((await bot.say('/link'))[0].text).toContain('/link 123456');
      expect((await bot.say('/unlink'))[0].text).toContain('diputuskan');
      expect(w.links.has('c1')).toBe(false);
    });

    it.each([
      ['SUSPENDED', 'ditangguhkan'],
      ['PENDING', 'menunggu persetujuan'],
      ['REJECTED', 'ditolak'],
    ] as const)('user %s ditolak dengan sopan dan tidak dibuatkan draft', async (status, phrase) => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1', status);
      expect((await bot.say('makan siang 35rb'))[0].text).toContain(phrase);
      expect((await bot.say('/saldo'))[0].text).toContain(phrase);
      expect(w.txs).toHaveLength(0);
    });

    it('chat grup ditolak', async () => {
      const w = buildWorld();
      w.link('g1', 'u1');
      const bot = new FakeChannelAdapter(w.core, 'g1', false);
      expect((await bot.say('makan 20rb'))[0].text).toContain('chat pribadi');
      expect(w.txs).toHaveLength(0);
    });

    it('rate limit: pesan ke-21 dalam semenit ditolak', async () => {
      const w = buildWorld();
      const bot = w.chat('c1', 'u1');
      for (let i = 0; i < 20; i++) await bot.say('/help');
      expect((await bot.say('/help'))[0].text).toContain('Terlalu banyak');
    });
  });

  describe('input → draft → simpan', () => {
    it('"makan siang 35rb" → DRAFT (bukan CONFIRMED) dengan preview & tombol lengkap', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const [msg] = await bot.say('makan siang 35rb');

      expect(w.txs).toHaveLength(1);
      expect(w.txs[0]).toMatchObject({ status: 'DRAFT', source: 'TELEGRAM', type: 'EXPENSE', amount: 35_000n, categoryId: 'cat-expense-makan', walletId: 'w-bca', date: today() });
      expect(msg.text).toContain('Pengeluaran · Rp35.000');
      expect(msg.text).toContain('Makan & Minum');
      expect(msg.text).toContain('BCA');
      expect(msg.buttons.flat().map((b) => b.text)).toEqual(['✅ Simpan', '❌ Batal', '🏷 Kategori', '👛 Dompet', '📅 Tanggal']);
    });

    it('tombol Simpan → CONFIRMED, pesan yang sama diedit (tidak ada pesan baru)', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      const id = w.txs[0].id;
      const before = bot.messages.length;

      const created = await bot.press(`s:${id}`);
      expect(created).toHaveLength(0);
      expect(bot.messages).toHaveLength(before);
      expect(w.txs[0].status).toBe('CONFIRMED');
      expect(bot.last.text).toContain('Tersimpan');
      expect(bot.last.buttons).toEqual([]);
    });

    it('menekan Simpan dua kali tidak menggandakan transaksi', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      const id = w.txs[0].id;
      await bot.press(`s:${id}`);
      await bot.press(`s:${id}`);
      expect(w.txs).toHaveLength(1);
      expect(w.transactions.confirmDraft).toHaveBeenCalledTimes(1);
    });

    it('Batal membuang draft', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('bensin 20k');
      await bot.press(`x:${w.txs[0].id}`);
      expect(w.txs).toHaveLength(0);
      expect(bot.last.text).toContain('dibatalkan');
    });

    it('semua data callback < 64 byte (ID UUID asli)', async () => {
      const w = buildWorld();
      const bot = w.chat('c1', 'u1');
      await bot.say('makan 20rb'); // tanpa default → pertanyaan dompet
      const all: string[] = bot.messages.flatMap((m) => m.buttons.flat().map((b) => b.data));
      w.link('c2', 'u1');
      const bot2 = w.chat('c2');
      w.pendings.clear();
      const w2 = buildWorld({ defaultWallet: 'w-bca' });
      const b3 = w2.chat('c3', 'u1');
      await b3.say('tuku kopi 18rb gopay');
      const id = w2.txs[0].id;
      for (const p of [`c:${id}`, `w:${id}`, `d:${id}`]) await b3.press(p);
      all.push(...b3.messages.flatMap((m) => m.buttons.flat().map((b) => b.data)));
      expect(bot2).toBeDefined();
      expect(all.length).toBeGreaterThan(5);
      for (const data of all) expect(Buffer.byteLength(data)).toBeLessThan(64);
    });
  });

  describe('dompet', () => {
    it('dompet disebut di teks dipakai ("tuku kopi 18rb gopay")', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('tuku kopi 18rb gopay');
      expect(w.txs[0].walletId).toBe('w-gopay');
    });

    it('tanpa dompet default & >1 dompet → tanya lewat tombol; draft dibuat setelah dipilih', async () => {
      const w = buildWorld();
      const bot = w.chat('c1', 'u1');
      const [q] = await bot.say('makan siang 35rb');
      expect(q.text).toContain('Pakai dompet mana?');
      expect(w.txs).toHaveLength(0);
      expect(w.pendings.size).toBe(1);

      await bot.press(q.buttons[1][0].data); // GoPay
      expect(w.txs).toHaveLength(1);
      expect(w.txs[0]).toMatchObject({ status: 'DRAFT', walletId: 'w-gopay' });
      expect(w.pendings.size).toBe(0);
      expect(bot.last.text).toContain('Draft transaksi');
    });

    it('hanya satu dompet → langsung dipakai tanpa bertanya', async () => {
      const w = buildWorld({ wallets: [WALLETS[0]] });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      expect(w.txs[0].walletId).toBe('w-bca');
    });

    it('tombol Dompet mengganti dompet pada draft yang sama', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      const id = w.txs[0].id;
      await bot.press(`w:${id}`);
      expect(bot.last.text).toContain('Pilih dompet');
      await bot.press(`w:${id}:1`);
      expect(w.txs[0].walletId).toBe('w-gopay');
      expect(bot.last.text).toContain('GoPay');
    });

    it('pending milik user lain tidak bisa dipakai', async () => {
      const w = buildWorld();
      const a = w.chat('ca', 'uA');
      const b = w.chat('cb', 'uB');
      const [q] = await a.say('makan siang 35rb');
      await b.press(q.buttons[0][0].data); // data milik A ditekan B
      expect(w.txs).toHaveLength(0);
      expect(w.pendings.size).toBe(1);
    });

    it('belum punya dompet → arahkan ke web', async () => {
      const w = buildWorld({ wallets: [] });
      const bot = w.chat('c1', 'u1');
      expect((await bot.say('makan 20rb'))[0].text).toContain('belum punya dompet');
    });
  });

  describe('kategori & belajar', () => {
    it('kategori tidak dikenal → preview "(belum dipilih)"; Simpan membuka pilihan kategori', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const [msg] = await bot.say('zara 50rb');
      expect(msg.text).toContain('(belum dipilih)');
      const id = w.txs[0].id;

      await bot.press(`s:${id}`);
      expect(w.txs[0].status).toBe('DRAFT');
      expect(bot.last.text).toContain('Pilih kategori');
      expect(bot.last.buttons.flat().some((b) => b.text.includes('Hiburan'))).toBe(true);
    });

    it('koreksi kategori → rule tersimpan dan dipakai untuk pesan berikutnya', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('zara 50rb');
      const id = w.txs[0].id;

      await bot.press(`c:${id}`);
      const hiburan = bot.last.buttons.flat().find((b) => b.text.includes('Hiburan'));
      await bot.press(hiburan!.data);

      expect(w.txs[0].categoryId).toBe('cat-expense-hiburan');
      expect(w.rules).toEqual([{ userId: 'u1', pattern: 'zara', categoryId: 'cat-expense-hiburan' }]);
      expect(bot.last.text).toContain('Hiburan');

      await bot.say('zara 30rb');
      expect(w.txs[1].categoryId).toBe('cat-expense-hiburan');
    });

    it('rule user mengalahkan kata kunci default dan tidak bocor ke user lain', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.rules.push({ userId: 'u1', pattern: 'kopi', categoryId: 'cat-expense-hiburan' });
      const a = w.chat('ca', 'u1');
      const b = w.chat('cb', 'u2');
      await a.say('kopi 18rb');
      await b.say('kopi 18rb');
      expect(w.txs.find((t) => t.userId === 'u1')?.categoryId).toBe('cat-expense-hiburan');
      expect(w.txs.find((t) => t.userId === 'u2')?.categoryId).toBe('cat-expense-makan');
    });
  });

  describe('fallback AI (teks bebas)', () => {
    const aiResult = (over: Record<string, unknown> = {}) => ({
      type: 'EXPENSE',
      amount: 1_000_000n,
      categoryId: 'cat-expense-transport',
      walletId: null,
      toWalletId: null,
      date: null,
      merchant: 'gojek',
      note: null,
      confidence: 0.8,
      ...over,
    });

    it('parser aturan yakin → LLM TIDAK dipanggil', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      expect(w.ai.parse).not.toHaveBeenCalled();
      expect(w.txs[0].aiConfidence).toBeNull();
    });

    it('nominal tak terbaca parser → LLM menebak → tetap DRAFT, berlabel "ditebak AI", aiConfidence tersimpan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.ai.parse.mockResolvedValue(aiResult());
      const bot = w.chat('c1', 'u1');
      const [msg] = await bot.say('bayar gojek sejuta');
      expect(w.ai.parse).toHaveBeenCalledTimes(1);
      expect(w.aiUsage.track).toHaveBeenCalledWith('u1', 'PARSE', expect.any(Function));
      expect(w.txs[0]).toMatchObject({ status: 'DRAFT', type: 'EXPENSE', amount: 1_000_000n, categoryId: 'cat-expense-transport', walletId: 'w-bca', aiConfidence: 0.8 });
      expect(msg.text).toContain('🤖 ditebak AI (yakin 80%)');
      expect(msg.text).toContain('Rp1.000.000');
    });

    it('kategori tak dikenal tapi nominal ada → LLM hanya melengkapi kategori; nominal dari parser dipertahankan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.ai.parse.mockResolvedValue(aiResult({ amount: 999n, categoryId: 'cat-expense-hiburan', confidence: 0.6 }));
      const bot = w.chat('c1', 'u1');
      await bot.say('zara 50rb');
      expect(w.txs[0]).toMatchObject({ amount: 50_000n, categoryId: 'cat-expense-hiburan', aiConfidence: 0.6, status: 'DRAFT' });
    });

    it('kategori dari AI dengan tipe tidak cocok diabaikan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.ai.parse.mockResolvedValue(aiResult({ type: 'INCOME', categoryId: 'cat-income-gaji' }));
      const bot = w.chat('c1', 'u1');
      await bot.say('zara 50rb'); // parser: EXPENSE
      expect(w.txs[0].categoryId).toBeNull();
      expect(w.txs[0].aiConfidence).toBeNull();
    });

    it('koreksi kategori pada draft AI → rule tersimpan; input serupa berikutnya tidak memanggil LLM lagi', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.ai.parse.mockResolvedValue(aiResult({ categoryId: 'cat-expense-transport', merchant: 'zara' }));
      const bot = w.chat('c1', 'u1');
      await bot.say('zara 50rb');
      const id = w.txs[0].id;
      await bot.press(`c:${id}`);
      await bot.press(bot.last.buttons.flat().find((b) => b.text.includes('Hiburan'))!.data);
      expect(w.rules).toEqual([{ userId: 'u1', pattern: 'zara', categoryId: 'cat-expense-hiburan' }]);

      w.ai.parse.mockClear();
      await bot.say('zara 30rb');
      expect(w.ai.parse).not.toHaveBeenCalled();
      expect(w.txs[1].categoryId).toBe('cat-expense-hiburan');
    });

    it('LLM gagal/tidak tersedia: baris gagal tetap dijelaskan; draft tanpa kategori tetap dibuat', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true; // parse default melempar AiUnavailableError
      const bot = w.chat('c1', 'u1');
      const out = await bot.say('bayar gojek sejuta\nzara 50rb');
      expect(w.txs).toHaveLength(1);
      expect(w.txs[0].amount).toBe(50_000n);
      expect(out[out.length - 1].text).toContain('AI sedang tidak tersedia');
    });

    it('LLM belum dikonfigurasi → tidak dipanggil dan tidak memakai kuota', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = false;
      const bot = w.chat('c1', 'u1');
      await bot.say('bayar gojek sejuta');
      expect(w.ai.parse).not.toHaveBeenCalled();
      expect(w.aiUsage.track).not.toHaveBeenCalled();
    });

    it('kuota habis → pesan jelas sekali, panggilan AI berikutnya dihentikan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.aiUsage.track.mockRejectedValue(new AiQuotaError(50));
      const bot = w.chat('c1', 'u1');
      const out = await bot.say('zara 50rb\nuniqlo 70rb');
      expect(w.aiUsage.track).toHaveBeenCalledTimes(1);
      expect(w.txs).toHaveLength(2);
      expect(out[out.length - 1].text).toContain('50/hari');
    });

    it('baris tanpa angka/kata bilangan tidak dikirim ke LLM; maks 3 panggilan per pesan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.ai.parse.mockResolvedValue(aiResult());
      const bot = w.chat('c1', 'u1');
      await bot.say('ngawur total');
      expect(w.ai.parse).not.toHaveBeenCalled();

      await bot.say('a sejuta\nb sejuta\nc sejuta\nd sejuta\ne sejuta');
      expect(w.ai.parse).toHaveBeenCalledTimes(3);
    });

    it('AI tanpa nominal (amount null) → ditolak dengan pesan parser', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      w.ai.available = true;
      w.ai.parse.mockResolvedValue(aiResult({ amount: null }));
      const bot = w.chat('c1', 'u1');
      const out = await bot.say('beli sesuatu sejuta lebih');
      expect(w.txs).toHaveLength(0);
      expect(out[0].text).toContain('Tidak bisa diproses');
    });
  });

  describe('tanggal', () => {
    it('"kemarin parkir 5000" → tanggal kemarin; tombol Tanggal mengganti tanggal', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('kemarin parkir 5000');
      expect(w.txs[0].date).toBe(yesterday());
      const id = w.txs[0].id;
      await bot.press(`d:${id}`);
      expect(bot.last.text).toContain('Pilih tanggal');
      await bot.press(`d:${id}:0`);
      expect(w.txs[0].date).toBe(today());
      expect(bot.last.text).toContain('(hari ini)');
    });
  });

  describe('multi baris, transfer & kegagalan', () => {
    it('beberapa baris → beberapa draft; baris gagal dilaporkan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const out = await bot.say('makan 20rb\nbensin 30rb\nngawur');
      expect(w.txs).toHaveLength(2);
      expect(out).toHaveLength(3);
      expect(out[2].text).toContain('Tidak bisa diproses');
      expect(out[2].text).toContain('ngawur');
    });

    it('pesan tanpa nominal → penjelasan, tidak ada draft', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const [msg] = await bot.say('halo apa kabar');
      expect(msg.text).toContain('Nominal tidak ditemukan');
      expect(w.txs).toHaveLength(0);
    });

    it('transfer: tanpa tombol kategori, menampilkan asal → tujuan, bisa disimpan tanpa kategori', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const [msg] = await bot.say('transfer 500rb bca ke gopay');
      expect(msg.text).toContain('BCA → GoPay');
      expect(msg.buttons.flat().some((b) => b.text.includes('Kategori'))).toBe(false);
      await bot.press(`s:${w.txs[0].id}`);
      expect(w.txs[0]).toMatchObject({ type: 'TRANSFER', status: 'CONFIRMED', categoryId: null });
    });

    it('maksimal 10 baris per pesan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const text = Array.from({ length: 12 }, (_, i) => `makan ${i + 1}0rb`).join('\n');
      const out = await bot.say(text);
      expect(w.txs).toHaveLength(10);
      expect(out[out.length - 1].text).toContain('2 baris terakhir diabaikan');
    });
  });

  describe('keamanan callback', () => {
    it('tombol dari draft milik user lain ditolak: draft tidak berubah', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const a = w.chat('ca', 'uA');
      const b = w.chat('cb', 'uB');
      await a.say('makan siang 35rb');
      const id = w.txs[0].id;

      for (const data of [`s:${id}`, `x:${id}`, `c:${id}:0`, `w:${id}:1`, `d:${id}:1`]) {
        await b.press(data);
        expect(b.last.text).toContain('tidak ditemukan');
      }
      expect(w.txs).toHaveLength(1);
      expect(w.txs[0]).toMatchObject({ status: 'DRAFT', walletId: 'w-bca', categoryId: 'cat-expense-makan', date: today() });
    });

    it('callback sampah / kedaluwarsa tidak membuat error', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.press('zzz');
      expect(bot.last.text).toContain('tidak berlaku');
      await bot.press(`s:${randomUUID()}`);
      expect(bot.last.text).toContain('tidak ditemukan');
    });
  });

  describe('/undo & /batal', () => {
    it('/undo → konfirmasi tombol → hapus transaksi Telegram terakhir', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      const id = w.txs[0].id;
      await bot.press(`s:${id}`);

      const [ask] = await bot.say('/undo');
      expect(ask.text).toContain('Batalkan transaksi ini?');
      expect(ask.text).toContain('Rp35.000');
      expect(ask.buttons.flat().map((b) => b.text)).toEqual(['↩ Ya, batalkan', 'Tidak']);

      await bot.press(`uy:${id}`);
      expect(w.txs).toHaveLength(0);
      expect(bot.last.text).toContain('Dibatalkan');
    });

    it('/undo lalu "Tidak" mempertahankan transaksi', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan siang 35rb');
      await bot.press(`s:${w.txs[0].id}`);
      await bot.say('/undo');
      await bot.press('un:-');
      expect(w.txs).toHaveLength(1);
      expect(bot.last.text).toContain('dipertahankan');
    });

    it('/undo tanpa transaksi, atau transaksi lewat 24 jam → tidak ada yang bisa dibatalkan', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      expect((await bot.say('/undo'))[0].text).toContain('Tidak ada transaksi');

      await bot.say('makan siang 35rb');
      await bot.press(`s:${w.txs[0].id}`);
      w.txs[0].confirmedAt = Date.now() - 25 * 60 * 60 * 1000;
      expect((await bot.say('/undo'))[0].text).toContain('Tidak ada transaksi');
    });

    it('uy untuk transaksi yang bukan yang terakhir / milik user lain ditolak', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const a = w.chat('ca', 'uA');
      const b = w.chat('cb', 'uB');
      await a.say('makan siang 35rb');
      await a.press(`s:${w.txs[0].id}`);
      await b.press(`uy:${w.txs[0].id}`);
      expect(w.txs).toHaveLength(1);
    });

    it('/batal membuang semua draft aktif (dan input tertunda), transaksi tersimpan tidak tersentuh', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      await bot.say('makan 20rb\nbensin 30rb');
      await bot.press(`s:${w.txs[0].id}`);
      expect((await bot.say('/batal'))[0].text).toContain('1 draft dibuang');
      expect(w.txs).toHaveLength(1);
      expect(w.txs[0].status).toBe('CONFIRMED');
      expect((await bot.say('/batal'))[0].text).toContain('Tidak ada draft');
    });
  });

  describe('laporan', () => {
    it('/saldo: per dompet + total', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      const [msg] = await bot.say('/saldo');
      expect(msg.text).toContain('⭐ BCA: Rp6.300.000');
      expect(msg.text).toContain('GoPay: Rp150.000');
      expect(msg.text).toContain('Total: Rp6.450.000');
      expect(msg.text.split('\n').length).toBeLessThanOrEqual(10);
    });

    it('/hariini, /bulanini, /alokasi, /tabungan: ringkas (≤10 baris) dan Rupiah', async () => {
      const w = buildWorld({ defaultWallet: 'w-bca' });
      const bot = w.chat('c1', 'u1');
      for (const cmd of ['/hariini', '/bulanini', '/alokasi', '/tabungan']) {
        const [msg] = await bot.say(cmd);
        expect(msg.text.split('\n').length).toBeLessThanOrEqual(10);
        expect(msg.text).toContain('Rp');
      }
      expect((await bot.say('/hariini'))[0].text).toContain('Masuk: Rp5.000.000');
      expect(w.dashboard.period).toHaveBeenCalled();
      expect((await bot.say('/alokasi'))[0].text).toContain('Fase 2');
    });

    it('/help dan perintah tak dikenal; perintah dengan @namabot', async () => {
      const w = buildWorld();
      const bot = w.chat('c1', 'u1');
      expect((await bot.say('/help'))[0].text).toContain('/saldo');
      expect((await bot.say('/ngawur'))[0].text).toContain('tidak dikenal');
      expect((await bot.say('/saldo@finance_bot'))[0].text).toContain('Saldo');
    });
  });
});
