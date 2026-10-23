import { AiUnavailableError } from '../ai/ai.errors';
import type { LlmMessage } from '../ai/llm-client.service';
import { UsageMeter } from '../ai/usage-meter';
import { AiChatService, MAX_TOOL_ITERATIONS, STORED_MESSAGES_LIMIT, toPlainText } from './ai-chat.service';
import { fakePeriods } from '../periods/periods.testing';
import { CHAT_TOOLS, ChatToolsService, MAX_SEARCH_ROWS } from './chat-tools.service';

const summary = {
  month: '2026-10',
  period: { key: '2026-10', label: 'Okt 2026', start: '2026-10-01', end: '2026-10-31' },
  previousMonth: '2026-09',
  totalIncome: '5000000',
  totalExpense: '1287500',
  net: '3712500',
  previous: { totalIncome: '4000000', totalExpense: '250000', net: '3750000' },
  change: { income: 25, expense: 415, net: -1 },
  totalBalance: '8712500',
};

const buildTools = () => {
  const dashboard = {
    summary: jest.fn().mockResolvedValue(summary),
    byCategory: jest.fn().mockResolvedValue({ month: '2026-10', period: { label: 'Okt 2026' }, type: 'EXPENSE', total: '1287500', items: [{ name: 'Makan & Minum', total: '1252500', percent: 97.3, count: 3 }] }),
    trend: jest.fn().mockResolvedValue({ months: [{ month: '2026-10', label: 'Okt 2026', income: '5000000', expense: '1287500', net: '3712500' }] }),
  };
  const transactions = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
  const wallets = { list: jest.fn().mockResolvedValue([{ id: 'w1', name: 'BCA', type: 'BANK', balance: '6300000' }]), investmentSummary: jest.fn() };
  const savings = { list: jest.fn().mockResolvedValue([{ name: 'Dana Darurat', type: 'EMERGENCY', collected: '1800000', target: '1500000', percent: 120, remaining: '0', estimatedMonths: 0 }]) };
  const allocation = { report: jest.fn().mockResolvedValue({ month: '2026-10', period: { label: 'Okt 2026' }, phase: 1, monthlyIncome: '10000000', items: [{ name: 'Kebutuhan', percent: 45, planned: '4500000', realized: '1252500', remaining: '3247500', status: 'AMAN' }] }) };
  const categories = { list: jest.fn().mockResolvedValue([{ id: 'cat-makan', name: 'Makan & Minum' }, { id: 'cat-trans', name: 'Transportasi' }]) };
  const tools = new ChatToolsService(dashboard as never, transactions as never, wallets as never, savings as never, allocation as never, categories as never);
  return { tools, dashboard, transactions, wallets, savings, allocation, categories };
};

describe('CHAT_TOOLS (definisi)', () => {
  it('8 tool yang diminta; tidak ada parameter userId di mana pun', () => {
    expect(CHAT_TOOLS.map((t) => t.name)).toEqual([
      'get_summary', 'get_spending_by_category', 'get_trend', 'search_transactions', 'get_wallet_balances', 'get_investments', 'get_savings_status', 'get_allocation',
    ]);
    expect(JSON.stringify(CHAT_TOOLS).toLowerCase()).not.toContain('userid');
  });
});

describe('ChatToolsService', () => {
  it('userId diteruskan dari server, bukan dari argumen model; argumen userId ditolak (strict)', async () => {
    const t = buildTools();
    await t.tools.execute('u-server', 'get_summary', '{"month":"2026-10"}');
    expect(t.dashboard.summary).toHaveBeenCalledWith('u-server', { month: '2026-10' });

    const injected = JSON.parse(await t.tools.execute('u-server', 'get_summary', '{"month":"2026-10","userId":"orang-lain"}'));
    expect(injected.error).toContain('Argumen tidak valid');
    expect(t.dashboard.summary).toHaveBeenCalledTimes(1);
  });

  it('get_summary: nilai Rupiah diformat dan periode disebutkan', async () => {
    const out = JSON.parse(await buildTools().tools.execute('u1', 'get_summary', '{}'));
    expect(out).toMatchObject({ period: '2026-10', periodLabel: 'Okt 2026', totalExpenseFormatted: 'Rp1.287.500', totalIncomeFormatted: 'Rp5.000.000', netFormatted: 'Rp3.712.500', totalBalanceFormatted: 'Rp8.712.500' });
  });

  it('argumen tidak valid / JSON rusak / tool tak dikenal → {"error"} (tidak melempar)', async () => {
    const t = buildTools();
    expect(JSON.parse(await t.tools.execute('u1', 'get_summary', '{"month":"oktober"}')).error).toContain('month');
    expect(JSON.parse(await t.tools.execute('u1', 'get_summary', '{rusak')).error).toContain('bukan JSON');
    expect(JSON.parse(await t.tools.execute('u1', 'hapus_semua', '{}')).error).toContain('tidak dikenal');
    expect(JSON.parse(await t.tools.execute('u1', 'get_trend', '{"months":99}')).error).toContain('months');
  });

  it('search_transactions: maks 20 baris (limit lebih besar ditolak), nama kategori/dompet di-resolve di server', async () => {
    const t = buildTools();
    expect(JSON.parse(await t.tools.execute('u1', 'search_transactions', '{"limit":500}')).error).toContain('limit');
    t.transactions.list.mockResolvedValue({
      items: [{ date: '2026-10-22', type: 'EXPENSE', amount: '35000', category: { name: 'Makan & Minum' }, wallet: { name: 'BCA' }, toWallet: null, merchant: 'Warung', note: null }],
      nextCursor: 'abc',
    });
    const out = JSON.parse(await t.tools.execute('u1', 'search_transactions', '{"categoryName":"makan","walletName":"bca","limit":20,"dateFrom":"2026-10-01"}'));
    expect(t.transactions.list).toHaveBeenCalledWith('u1', expect.objectContaining({ categoryId: 'cat-makan', walletId: 'w1', limit: MAX_SEARCH_ROWS, dateFrom: '2026-10-01' }));
    expect(out).toMatchObject({ count: 1, hasMore: true, transactions: [{ amountFormatted: 'Rp35.000', category: 'Makan & Minum' }] });
  });

  it('kategori/dompet yang tidak ada → error jelas tanpa memanggil list transaksi', async () => {
    const t = buildTools();
    expect(JSON.parse(await t.tools.execute('u1', 'search_transactions', '{"categoryName":"zzz"}')).error).toContain('tidak ditemukan');
    expect(JSON.parse(await t.tools.execute('u1', 'search_transactions', '{"walletName":"zzz"}')).error).toContain('tidak ditemukan');
    expect(t.transactions.list).not.toHaveBeenCalled();
  });

  it('wallet, tabungan, alokasi, tren, kategori memetakan service yang ada (Rupiah terformat)', async () => {
    const t = buildTools();
    expect(JSON.parse(await t.tools.execute('u1', 'get_wallet_balances', '{}'))).toMatchObject({ totalFormatted: 'Rp6.300.000', wallets: [{ name: 'BCA', balanceFormatted: 'Rp6.300.000' }] });
    expect(JSON.parse(await t.tools.execute('u1', 'get_savings_status', '{}')).goals[0]).toMatchObject({ name: 'Dana Darurat', collectedFormatted: 'Rp1.800.000', percent: 120 });
    expect(JSON.parse(await t.tools.execute('u1', 'get_allocation', '{"month":"2026-10"}')).items[0]).toMatchObject({ name: 'Kebutuhan', status: 'AMAN', realizedFormatted: 'Rp1.252.500' });
    expect(t.allocation.report).toHaveBeenCalledWith('u1', { month: '2026-10' });
    expect(JSON.parse(await t.tools.execute('u1', 'get_trend', '{"months":3}')).months[0].expenseFormatted).toBe('Rp1.287.500');
    expect(t.dashboard.trend).toHaveBeenCalledWith('u1', { months: 3 });
    expect(JSON.parse(await t.tools.execute('u1', 'get_spending_by_category', '{}')).categories[0]).toMatchObject({ name: 'Makan & Minum', percent: 97.3 });
  });

  it('error service (mis. alokasi belum ada) dikembalikan sebagai {"error"}; hasil sangat besar dipotong', async () => {
    const t = buildTools();
    t.allocation.report.mockRejectedValue(new Error('Belum ada rencana alokasi.'));
    expect(JSON.parse(await t.tools.execute('u1', 'get_allocation', '{}')).error).toContain('Belum ada rencana alokasi');
    t.wallets.list.mockResolvedValue(Array.from({ length: 400 }, (_, i) => ({ id: `w${i}`, name: `Dompet panjang ${i}`, type: 'BANK', balance: '1000' })));
    expect((await t.tools.execute('u1', 'get_wallet_balances', '{}')).length).toBeLessThanOrEqual(6100);
  });
});

describe('AiChatService', () => {
  const build = (history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }> = []) => {
    const llm = { chat: jest.fn() };
    const prompts = { get: jest.fn().mockReturnValue('SYSTEM PROMPT') };
    const usage = { track: jest.fn(async (_u: string, _f: string, fn: (m: UsageMeter) => Promise<unknown>) => fn(new UsageMeter())) };
    const tools = { execute: jest.fn().mockResolvedValue('{"totalExpenseFormatted":"Rp1.287.500","ok":true}') };
    const repo = {
      recent: jest.fn().mockResolvedValue(history.map((h, i) => ({ id: `m${i}`, createdAt: new Date(), ...h }))),
      addExchange: jest.fn().mockResolvedValue(undefined),
      prune: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(1),
    };
    const service = new AiChatService(llm as never, prompts as never, usage as never, tools as never, repo as never, fakePeriods() as never);
    return { service, llm, prompts, usage, tools, repo };
  };
  const call = (id: string, name: string, args = '{}') => ({ id, name, arguments: args });
  const final = (content: string) => ({ content, toolCalls: [], finishReason: 'stop' });
  const withTools = (...calls: ReturnType<typeof call>[]) => ({ content: '', toolCalls: calls, finishReason: 'tool_calls' });

  it('alur tool: model minta tool → server menjalankan dengan userId → hasil dikirim balik → jawaban akhir; riwayat tersimpan', async () => {
    const t = build();
    t.llm.chat.mockResolvedValueOnce(withTools(call('t1', 'get_summary', '{"month":"2026-10"}'))).mockResolvedValueOnce(final('Pengeluaranmu bulan Oktober 2026 Rp1.287.500.'));

    const res = await t.service.ask('u1', 'berapa pengeluaran bulan ini?');

    expect(res).toEqual({ reply: 'Pengeluaranmu bulan Oktober 2026 Rp1.287.500.', toolsUsed: ['get_summary'] });
    expect(t.usage.track).toHaveBeenCalledWith('u1', 'CHAT', expect.any(Function));
    expect(t.tools.execute).toHaveBeenCalledWith('u1', 'get_summary', '{"month":"2026-10"}');
    const secondCall = t.llm.chat.mock.calls[1][0].messages as LlmMessage[];
    expect(secondCall.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 't1', name: 'get_summary' }] });
    expect(secondCall.at(-1)).toEqual({ role: 'tool', toolCallId: 't1', content: '{"totalExpenseFormatted":"Rp1.287.500","ok":true}' });
    expect(t.llm.chat.mock.calls[0][0].tools).toBe(CHAT_TOOLS);
    expect(t.repo.addExchange).toHaveBeenCalledWith('u1', 'berapa pengeluaran bulan ini?', 'Pengeluaranmu bulan Oktober 2026 Rp1.287.500.');
    expect(t.repo.prune).toHaveBeenCalledWith('u1', STORED_MESSAGES_LIMIT);
  });

  it('pertanyaan di luar topik: model menjawab langsung tanpa tool', async () => {
    const t = build();
    t.llm.chat.mockResolvedValue(final('Maaf, aku hanya bisa membantu soal keuanganmu.'));
    const res = await t.service.ask('u1', 'siapa presiden Prancis?');
    expect(res.toolsUsed).toEqual([]);
    expect(t.tools.execute).not.toHaveBeenCalled();
    expect(t.llm.chat).toHaveBeenCalledTimes(1);
  });

  it('maksimal 4 iterasi tool, lalu satu panggilan terakhir TANPA tools', async () => {
    const t = build();
    t.llm.chat.mockImplementation(async (opts: { tools?: unknown }) => (opts.tools ? withTools(call(`t${t.llm.chat.mock.calls.length}`, 'get_summary')) : final('Jawaban dari data yang ada.')));
    const res = await t.service.ask('u1', 'analisis semuanya');
    expect(t.llm.chat).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS + 1);
    expect(t.tools.execute).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
    expect(t.llm.chat.mock.calls.at(-1)?.[0].tools).toBeUndefined();
    expect(res.reply).toBe('Jawaban dari data yang ada.');
  });

  it('maks. 4 tool call per giliran; setiap tool_call mendapat pesan tool (tidak ada yang menggantung)', async () => {
    const t = build();
    const many = Array.from({ length: 6 }, (_, i) => call(`t${i}`, 'get_wallet_balances'));
    t.llm.chat.mockResolvedValueOnce(withTools(...many)).mockResolvedValueOnce(final('ok'));
    await t.service.ask('u1', 'q');
    expect(t.tools.execute).toHaveBeenCalledTimes(4);
    const msgs = t.llm.chat.mock.calls[1][0].messages as LlmMessage[];
    const assistant = msgs.find((m) => m.role === 'assistant' && m.toolCalls);
    expect(assistant && 'toolCalls' in assistant ? assistant.toolCalls?.length : 0).toBe(4);
    expect(msgs.filter((m) => m.role === 'tool')).toHaveLength(4);
  });

  it('konteks: system prompt + riwayat (dipotong 500 karakter) + pertanyaan baru; hanya 50 pesan diminta', async () => {
    const t = build([
      { role: 'USER', content: 'pertanyaan lama' },
      { role: 'ASSISTANT', content: 'a'.repeat(2000) },
    ]);
    t.llm.chat.mockResolvedValue(final('ok'));
    await t.service.ask('u1', 'lanjutan');
    expect(t.repo.recent).toHaveBeenCalledWith('u1', 50);
    const msgs = t.llm.chat.mock.calls[0][0].messages as LlmMessage[];
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYSTEM PROMPT' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'pertanyaan lama' });
    expect((msgs[2].content as string).length).toBeLessThanOrEqual(501);
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'lanjutan' });
    expect(t.prompts.get).toHaveBeenCalledWith('chat-system', expect.objectContaining({ today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), period: expect.any(String), periodKey: expect.stringMatching(/^\d{4}-\d{2}$/) }));
  });

  it('AI gagal → error diteruskan dan riwayat TIDAK tersimpan', async () => {
    const t = build();
    t.llm.chat.mockRejectedValue(new AiUnavailableError());
    await expect(t.service.ask('u1', 'q')).rejects.toBeInstanceOf(AiUnavailableError);
    expect(t.repo.addExchange).not.toHaveBeenCalled();
  });

  it('jawaban kosong → fallback ramah; markdown dibersihkan; gagal menyimpan riwayat tidak mematahkan jawaban', async () => {
    const t = build();
    t.llm.chat.mockResolvedValue(final('   '));
    expect((await t.service.ask('u1', 'q')).reply).toContain('belum bisa menjawab');

    t.llm.chat.mockResolvedValue(final('**Total** tercatat\n# Judul\n* poin satu'));
    t.repo.addExchange.mockRejectedValue(new Error('db down'));
    expect((await t.service.ask('u1', 'q')).reply).toBe('Total tercatat\nJudul\n- poin satu');
  });

  describe('grounding: angka harus dari hasil tool giliran ini', () => {
    it('model menjawab angka tanpa memanggil tool (halusinasi) → dipaksa memakai tool (tool_choice required) lalu menjawab dari data', async () => {
      const t = build();
      t.llm.chat
        .mockResolvedValueOnce(final('Saldo terbesar ada di BCA sebesar Rp1.450.000.')) // karangan
        .mockResolvedValueOnce(withTools(call('t1', 'get_wallet_balances')))
        .mockResolvedValueOnce(final('Saldo terbesarmu Rp1.287.500.'));
      const res = await t.service.ask('u1', 'dompet apa saldo terbesar?');

      expect(res.reply).toBe('Saldo terbesarmu Rp1.287.500.');
      expect(res.toolsUsed).toEqual(['get_wallet_balances']);
      expect(t.llm.chat.mock.calls[1][0].toolChoice).toBe('required');
      const retryMessages = t.llm.chat.mock.calls[1][0].messages as LlmMessage[];
      expect(retryMessages.some((m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Rp1.450.000'))).toBe(true);
      expect(t.repo.addExchange).toHaveBeenCalledWith('u1', 'dompet apa saldo terbesar?', 'Saldo terbesarmu Rp1.287.500.');
    });

    it('tetap mengarang setelah koreksi → jawaban aman tanpa angka karangan (tidak ada Rp1.450.000)', async () => {
      const t = build();
      t.llm.chat.mockResolvedValue(final('BCA punya Rp1.450.000.'));
      const res = await t.service.ask('u1', 'saldo?');
      expect(res.reply).toContain('belum bisa memastikan angkanya');
      expect(res.reply).not.toContain('1.450.000');
      expect(t.llm.chat).toHaveBeenCalledTimes(2);
    });

    it('angka dari history (percakapan lama) tidak dianggap data: harus dari tool giliran ini', async () => {
      const t = build([{ role: 'ASSISTANT', content: 'Saldo BCA Rp1.450.000' }]);
      t.llm.chat.mockResolvedValue(final('Saldomu masih Rp1.450.000.'));
      expect((await t.service.ask('u1', 'masih sama?')).reply).toContain('belum bisa memastikan');
    });

    it('pembulatan wajar dari hasil tool diterima ("sekitar Rp1,3 juta"); jawaban tanpa angka & off-topic lolos', async () => {
      const t = build();
      t.llm.chat.mockResolvedValueOnce(withTools(call('t1', 'get_summary'))).mockResolvedValueOnce(final('Pengeluaranmu sekitar Rp1,3 juta.'));
      expect((await t.service.ask('u1', 'q')).reply).toBe('Pengeluaranmu sekitar Rp1,3 juta.');

      t.llm.chat.mockReset();
      t.llm.chat.mockResolvedValue(final('Maaf, aku hanya bisa membantu soal keuanganmu.'));
      expect((await t.service.ask('u1', 'siapa presiden?')).reply).toContain('hanya bisa membantu');
      expect(t.llm.chat).toHaveBeenCalledTimes(1);
    });

    it('jawaban akhir setelah batas iterasi juga diperiksa', async () => {
      const t = build();
      t.llm.chat.mockImplementation(async (opts: { tools?: unknown }) => (opts.tools ? withTools(call(`t${t.llm.chat.mock.calls.length}`, 'get_summary')) : final('Totalnya Rp9.999.999.')));
      expect((await t.service.ask('u1', 'q')).reply).toContain('belum bisa memastikan');
    });
  });

  it('riwayat & hapus riwayat per user', async () => {
    const t = build([{ role: 'USER', content: 'halo' }]);
    expect(await t.service.history('u1')).toEqual([expect.objectContaining({ role: 'USER', content: 'halo' })]);
    await t.service.clearHistory('u1');
    expect(t.repo.clear).toHaveBeenCalledWith('u1');
  });
});

describe('toPlainText', () => {
  it('menghapus penanda markdown umum', () => {
    expect(toPlainText('**tebal** dan __juga__ `kode`')).toBe('tebal dan juga kode');
  });
});

describe('ChatToolsService: investasi dan penyesuaian', () => {
  it('get_investments memformat ringkasan dari WalletsService (nilai, modal, untung/rugi)', async () => {
    const t = buildTools();
    t.wallets.investmentSummary.mockResolvedValue({
      wallets: [{ id: 'w1', name: 'Ipot', value: '8700000', capital: '10000000', unrealized: '-1300000', unrealizedPct: -13, lastAdjustedAt: null }],
      totalValue: '8700000',
      totalCapital: '10000000',
      totalUnrealized: '-1300000',
      totalUnrealizedPct: -13,
    });
    const out = JSON.parse(await t.tools.execute('u1', 'get_investments', '{}'));
    expect(t.wallets.investmentSummary).toHaveBeenCalledWith('u1');
    expect(out.wallets[0]).toMatchObject({ name: 'Ipot', valueFormatted: 'Rp8.700.000', unrealizedFormatted: '-Rp1.300.000', unrealizedPercent: '-13,00%' });
    expect(out.totalUnrealizedFormatted).toBe('-Rp1.300.000');
  });

  it('search_transactions menyembunyikan ADJUSTMENT', async () => {
    const t = buildTools();
    const base = { date: '2026-10-20', amount: '1000', wallet: { name: 'Ipot' }, category: null, merchant: null, note: null };
    t.transactions.list.mockResolvedValue({
      items: [{ ...base, type: 'ADJUSTMENT', amount: '-1300000' }, { ...base, type: 'EXPENSE' }],
      nextCursor: null,
    } as never);
    const out = JSON.parse(await t.tools.execute('u1', 'search_transactions', '{}'));
    expect(out.count).toBe(1);
    expect(out.transactions.map((x: { type: string }) => x.type)).toEqual(['EXPENSE']);
  });
});
