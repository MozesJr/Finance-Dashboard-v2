import { validateNarrativeNumbers } from 'shared';
import { AiParseError, AiUnavailableError } from '../ai/ai.errors';
import { UsageMeter } from '../ai/usage-meter';
import { fakePeriods } from '../periods/periods.testing';
import { InsightStats } from './insight.types';
import { collectStatNumbers, periodLabel, promptView, templateNarrative } from './insight-narrative';
import { InsightStatsService } from './insight-stats.service';
import { InsightsJobService } from './insights-job.service';
import { InsightsService } from './insights.service';

const fixture = (over: Partial<InsightStats> = {}): InsightStats => ({
  period: '2026-09',
  provisional: false,
  asOf: null,
  totalIncome: '5000000',
  totalExpense: '1287500',
  net: '3712500',
  previousMonthExpense: '250000',
  changeVsPreviousPercent: 415,
  avg3mExpense: '800000',
  avgBasisMonths: 2,
  expenseVsAvgPercent: 60.9,
  topCategories: [
    { name: 'Makan & Minum', total: '1217500', percent: 94.6, count: 12 },
    { name: 'Hiburan', total: '70000', percent: 5.4, count: 2 },
  ],
  anomalies: [{ name: 'Makan & Minum', total: '1217500', avg3m: '600000', increasePercent: 102.9 }],
  largestTransactions: [{ date: '2026-09-22', label: 'Warung', amount: '1200000' }],
  allocationFlags: [{ name: 'Gaya Hidup', status: 'HAMPIR', planned: '1500000', realized: '1300000' }],
  savings: [{ name: 'Dana Darurat', percent: 66.7, collected: '1000000', target: '1500000', remaining: '500000', estimatedMonths: 1 }],
  peakDay: { date: '2026-09-22', total: '1200000' },
  ...over,
});

const narrativeFrom = (s: InsightStats) => ({
  summary: `Pengeluaranmu ${s.totalExpense === '1287500' ? 'Rp1.287.500' : ''} bulan ini cukup tinggi dibanding biasanya.`,
  findings: ['Makan & Minum mendominasi pengeluaran.', 'Ada satu transaksi besar di Warung.', 'Hiburan masih kecil.'],
  suggestions: ['Batasi makan di luar minggu ini.', 'Catat transaksi harian.', 'Setor ke Dana Darurat.'],
});

describe('InsightStatsService', () => {
  const build = (over: { summaryByMonth?: Record<string, { totalExpense: string }>; categoriesByMonth?: Record<string, Array<{ name: string; total: string; percent: number; count: number }>> } = {}) => {
    const sum = (month: string) => {
      const e = over.summaryByMonth?.[month]?.totalExpense ?? '0';
      return { month, period: { key: month, label: `P ${month}` }, previousMonth: '', totalIncome: '5000000', totalExpense: e, net: '0', previous: { totalIncome: '0', totalExpense: '250000', net: '0' }, change: { income: 25, expense: 10, net: 0 }, totalBalance: '0' };
    };
    const dashboard = {
      summary: jest.fn(async (_u: string, q: { month: string }) => sum(q.month)),
      byCategory: jest.fn(async (_u: string, q: { month: string }) => ({ month: q.month, type: 'EXPENSE', total: '0', items: over.categoriesByMonth?.[q.month] ?? [] })),
      insightExtras: jest.fn().mockResolvedValue({ largestExpenses: [{ date: '2026-09-22', label: 'Warung', amount: '1200000' }], peakDay: { date: '2026-09-22', total: '1200000' } }),
    };
    const allocation = {
      report: jest.fn().mockResolvedValue({
        items: [
          { name: 'Kebutuhan', kind: 'EXPENSE', status: 'AMAN', planned: '1', realized: '1' },
          { name: 'Gaya Hidup', kind: 'EXPENSE', status: 'HAMPIR', planned: '1500000', realized: '1300000' },
          { name: 'Hiburan', kind: 'EXPENSE', status: 'LEBIH', planned: '100000', realized: '150000' },
          { name: 'Investasi', kind: 'SAVING', status: 'KURANG', planned: '5', realized: '1' },
        ],
      }),
    };
    const savings = { list: jest.fn().mockResolvedValue([{ name: 'Dana Darurat', percent: 50, collected: '750000', target: '1500000', remaining: '750000', estimatedMonths: 3 }]) };
    return { service: new InsightStatsService(dashboard as never, allocation as never, savings as never, fakePeriods() as never), dashboard, allocation, savings };
  };

  it('total, rata-rata 3 bulan sebelumnya (hanya bulan yang punya data), dan persentase vs rata-rata', async () => {
    const t = build({ summaryByMonth: { '2026-09': { totalExpense: '1000000' }, '2026-08': { totalExpense: '0' }, '2026-07': { totalExpense: '500000' }, '2026-06': { totalExpense: '600000' } } });
    // bulan target 2026-10 → sebelumnya 09, 08, 07 (08 kosong)
    t.dashboard.summary.mockImplementation(async (_u: string, q: { month: string }) => ({
      month: q.month, period: { key: q.month, label: `P ${q.month}` }, totalIncome: '5000000', net: '0', totalBalance: '0', previousMonth: '', change: { income: 1, expense: 40, net: 0 },
      totalExpense: ({ '2026-10': '1200000', '2026-09': '1000000', '2026-08': '0', '2026-07': '500000' } as Record<string, string>)[q.month] ?? '0',
      previous: { totalIncome: '0', totalExpense: '1000000', net: '0' },
    }));
    const stats = await t.service.build('u1', '2026-10');
    expect(stats).toMatchObject({ period: '2026-10', totalExpense: '1200000', avg3mExpense: '750000', avgBasisMonths: 2, expenseVsAvgPercent: 60, previousMonthExpense: '1000000', changeVsPreviousPercent: 40 });
    expect(t.dashboard.summary.mock.calls.map((c) => c[1].month).sort()).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('tanpa riwayat → avg null dan persentase null', async () => {
    const stats = await build().service.build('u1', '2026-10');
    expect(stats).toMatchObject({ avg3mExpense: null, avgBasisMonths: 0, expenseVsAvgPercent: null });
  });

  it('provisional & asOf hanya untuk bulan berjalan', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T05:00:00Z'));
    try {
      const t = build();
      expect(await t.service.build('u1', '2026-10')).toMatchObject({ provisional: true, asOf: '2026-10-23' });
      expect(await t.service.build('u1', '2026-09')).toMatchObject({ provisional: false, asOf: null });
    } finally {
      jest.useRealTimers();
    }
  });

  it('anomali: naik > 30% dari rata-rata kategori itu; abaikan < Rp50.000, kategori baru, dan kenaikan ≤ 30%', async () => {
    const cat = (name: string, total: string) => ({ name, total, percent: 0, count: 1 });
    const t = build({
      categoriesByMonth: {
        '2026-10': [cat('Makan', '1000000'), cat('Transport', '260000'), cat('Hiburan', '40000'), cat('Baru', '900000'), cat('Listrik', '300000')],
        '2026-09': [cat('Makan', '500000'), cat('Transport', '200000'), cat('Hiburan', '10000'), cat('Listrik', '300000')],
        '2026-08': [cat('Makan', '700000'), cat('Transport', '200000')],
        '2026-07': [],
      },
    });
    const stats = await t.service.build('u1', '2026-10');
    // Makan: avg (500k+700k)/2 = 600k → +66.7%; Transport 260k vs 200k = +30% (tidak > 30); Hiburan < 50k; Baru tanpa riwayat; Listrik 0%
    expect(stats.anomalies).toEqual([{ name: 'Makan', total: '1000000', avg3m: '600000', increasePercent: 66.7 }]);
  });

  it('top 5 kategori, flag alokasi hanya EXPENSE berstatus HAMPIR/LEBIH, laju tabungan, transaksi terbesar, hari puncak', async () => {
    const cats = Array.from({ length: 7 }, (_, i) => ({ name: `K${i}`, total: String(1000 * (7 - i)), percent: 10, count: 1 }));
    const t = build({ categoriesByMonth: { '2026-10': cats } });
    const stats = await t.service.build('u1', '2026-10');
    expect(stats.topCategories).toHaveLength(5);
    expect(stats.allocationFlags.map((f) => [f.name, f.status])).toEqual([['Gaya Hidup', 'HAMPIR'], ['Hiburan', 'LEBIH']]);
    expect(stats.savings[0]).toMatchObject({ name: 'Dana Darurat', percent: 50, remaining: '750000', estimatedMonths: 3 });
    expect(stats.largestTransactions[0]).toMatchObject({ label: 'Warung', amount: '1200000' });
    expect(stats.peakDay).toEqual({ date: '2026-09-22', total: '1200000' });
  });

  it('belum ada rencana alokasi / tabungan error → daftar kosong, tidak gagal', async () => {
    const t = build();
    t.allocation.report.mockRejectedValue(new Error('Belum ada rencana alokasi'));
    t.savings.list.mockRejectedValue(new Error('db'));
    const stats = await t.service.build('u1', '2026-10');
    expect(stats.allocationFlags).toEqual([]);
    expect(stats.savings).toEqual([]);
  });

  it('semua query difilter userId yang diberikan', async () => {
    const t = build();
    await t.service.build('u-xyz', '2026-10');
    for (const mock of [t.dashboard.summary, t.dashboard.byCategory, t.dashboard.insightExtras, t.allocation.report, t.savings.list]) {
      for (const call of mock.mock.calls) expect(call[0]).toBe('u-xyz');
    }
  });
});

describe('insight-narrative', () => {
  it('collectStatNumbers memuat semua nominal (nilai mutlak untuk selisih negatif)', () => {
    const numbers = collectStatNumbers(fixture({ net: '-500000' }));
    expect(numbers).toEqual(expect.arrayContaining([5_000_000n, 1_287_500n, 500_000n, 800_000n, 1_217_500n, 600_000n, 1_200_000n, 1_300_000n, 1_500_000n, 1_000_000n]));
  });

  it('promptView memformat nominal sebagai Rupiah dan menyertakan periode', () => {
    const view = promptView(fixture()) as Record<string, unknown>;
    expect(view).toMatchObject({ period: 'September 2026', totalExpense: 'Rp1.287.500', avg3mExpense: 'Rp800.000', provisional: false });
  });

  it('periodLabel', () => expect(periodLabel('2026-10')).toBe('Oktober 2026'));

  it.each([
    ['lengkap', fixture()],
    ['selisih negatif', fixture({ net: '-500000', totalIncome: '1000000', totalExpense: '1500000' })],
    ['sementara', fixture({ provisional: true, asOf: '2026-09-23' })],
    ['tanpa anomali/alokasi/tabungan', fixture({ anomalies: [], allocationFlags: [], savings: [] })],
    ['bulan kosong', fixture({ totalIncome: '0', totalExpense: '0', net: '0', previousMonthExpense: '0', avg3mExpense: null, expenseVsAvgPercent: null, avgBasisMonths: 0, topCategories: [], anomalies: [], largestTransactions: [], allocationFlags: [], savings: [], peakDay: null })],
  ])('templateNarrative (%s): 3 temuan, 3 saran, dan SELALU lolos validasi angka', (_n, stats) => {
    const n = templateNarrative(stats);
    expect(n.findings).toHaveLength(3);
    expect(n.suggestions).toHaveLength(3);
    expect(n.summary.length).toBeGreaterThan(10);
    expect(validateNarrativeNumbers([n.summary, ...n.findings, ...n.suggestions], collectStatNumbers(stats))).toEqual({ ok: true, unknown: [] });
  });

  it('template menyebut "sementara" untuk bulan berjalan', () => {
    expect(templateNarrative(fixture({ provisional: true, asOf: '2026-09-23' })).summary).toContain('sementara, data sampai 2026-09-23');
  });
});

describe('InsightsService', () => {
  const build = () => {
    const repo = { find: jest.fn(), upsert: jest.fn().mockResolvedValue({}) };
    const statsSvc = { build: jest.fn().mockResolvedValue(fixture()) };
    const llm = { structured: jest.fn() };
    const prompts = { get: jest.fn().mockReturnValue('PROMPT') };
    const usage = { track: jest.fn(async (_u: string, _f: string, fn: (m: UsageMeter) => Promise<unknown>) => fn(new UsageMeter())) };
    const service = new InsightsService(repo as never, statsSvc as never, llm as never, prompts as never, usage as never, fakePeriods() as never);
    return { service, repo, statsSvc, llm, prompts, usage };
  };
  const good = () => narrativeFrom(fixture());
  const bad = () => ({ ...good(), summary: 'Kamu menghemat Rp9.999.999 bulan ini, hebat sekali.' });

  it('narasi valid → source LLM, disimpan di cache (AiInsight), kuota fitur INSIGHT', async () => {
    const t = build();
    t.llm.structured.mockResolvedValue(good());
    const res = await t.service.generate('u1', '2026-09');
    expect(t.usage.track).toHaveBeenCalledWith('u1', 'INSIGHT', expect.any(Function), {});
    expect(res).toMatchObject({ period: '2026-09', source: 'LLM', provisional: false });
    expect(t.repo.upsert).toHaveBeenCalledWith('u1', '2026-09', expect.objectContaining({ source: 'LLM', stats: expect.objectContaining({ totalExpense: '1287500' }) }), expect.any(Date));
    const call = t.llm.structured.mock.calls[0][0];
    expect(call.messages[0].content).toBe('PROMPT');
    expect(call.messages[1].content).toContain('Rp1.287.500');
    expect(call.messages[1].content).not.toContain('"totalExpense":"1287500"');
    expect(call.temperature).toBe(0.5);
  });

  it('angka karangan → regenerate 1× dengan koreksi → lolos', async () => {
    const t = build();
    t.llm.structured.mockResolvedValueOnce(bad()).mockResolvedValueOnce(good());
    const res = await t.service.generate('u1', '2026-09');
    expect(res.source).toBe('LLM');
    expect(t.llm.structured).toHaveBeenCalledTimes(2);
    expect(t.llm.structured.mock.calls[1][0].messages[1].content).toContain('Rp9.999.999');
  });

  it('dua kali angka karangan → fallback ringkasan template tanpa LLM (angka dari statistik)', async () => {
    const t = build();
    t.llm.structured.mockResolvedValue(bad());
    const res = await t.service.generate('u1', '2026-09');
    expect(t.llm.structured).toHaveBeenCalledTimes(2);
    expect(res.source).toBe('TEMPLATE');
    expect(res.narrative.summary).toContain('Rp1.287.500');
    expect(t.repo.upsert).toHaveBeenCalledWith('u1', '2026-09', expect.objectContaining({ source: 'TEMPLATE' }), expect.any(Date));
  });

  it('output tidak bisa di-parse (AiParseError) → template; LLM mati (AiUnavailableError) → error, tidak menyimpan', async () => {
    const t = build();
    t.llm.structured.mockRejectedValue(new AiParseError());
    expect((await t.service.generate('u1', '2026-09')).source).toBe('TEMPLATE');

    t.repo.upsert.mockClear();
    t.llm.structured.mockRejectedValue(new AiUnavailableError());
    await expect(t.service.generate('u1', '2026-09')).rejects.toBeInstanceOf(AiUnavailableError);
    expect(t.repo.upsert).not.toHaveBeenCalled();
  });

  it('job (skipQuota) meneruskan opsi ke pelacak kuota', async () => {
    const t = build();
    t.llm.structured.mockResolvedValue(good());
    await t.service.generate('u1', '2026-09', { skipQuota: true });
    expect(t.usage.track).toHaveBeenCalledWith('u1', 'INSIGHT', expect.any(Function), { skipQuota: true });
  });

  it('get: cache dikembalikan dengan label provisional menurut bulan; tanpa cache → null (tanpa kuota)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T05:00:00Z'));
    try {
      const t = build();
      t.repo.find.mockResolvedValue(null);
      expect(await t.service.get('u1', '2026-10')).toBeNull();
      expect(t.usage.track).not.toHaveBeenCalled();

      const generatedAt = new Date('2026-10-23T01:00:00Z');
      t.repo.find.mockResolvedValue({ content: { stats: fixture(), narrative: good(), source: 'LLM' }, generatedAt });
      expect(await t.service.get('u1', '2026-10')).toMatchObject({ provisional: true, generatedAt });
      expect(await t.service.get('u1', '2026-09')).toMatchObject({ provisional: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('getOrGenerate: cache segar dipakai, kedaluwarsa → generate baru', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T10:00:00Z'));
    try {
      const t = build();
      t.llm.structured.mockResolvedValue(good());
      const hour = 60 * 60 * 1000;
      t.repo.find.mockResolvedValue({ content: { stats: fixture(), narrative: good(), source: 'LLM' }, generatedAt: new Date(Date.now() - hour) });
      await t.service.getOrGenerate('u1', '2026-10', 6 * hour);
      expect(t.llm.structured).not.toHaveBeenCalled();

      t.repo.find.mockResolvedValue({ content: { stats: fixture(), narrative: good(), source: 'LLM' }, generatedAt: new Date(Date.now() - 7 * hour) });
      await t.service.getOrGenerate('u1', '2026-10', 6 * hour);
      expect(t.llm.structured).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('InsightsJobService', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const build = (ids: string[] = ['u1', 'u2', 'u3']) => {
    const repo = { findActiveUserIdsWithActivity: jest.fn().mockResolvedValue(ids) };
    const insights = { generate: jest.fn().mockResolvedValue({}) };
    return { repo, insights, job: new InsightsJobService(repo as never, insights as never) };
  };

  it('tanggal 1 (startDay 1): periode sebelumnya = bulan kalender, tanpa kuota, berurutan; satu kegagalan tidak menghentikan yang lain', async () => {
    const t = build();
    t.insights.generate.mockReset();
    t.insights.generate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('LLM down')).mockResolvedValueOnce({});
    expect(await t.job.runDaily(day('2026-11-01'))).toEqual({ period: '2026-10', generated: 2, failed: 1 });
    const [start, end, startDay] = t.repo.findActiveUserIdsWithActivity.mock.calls[0];
    expect([start.toISOString(), end.toISOString(), startDay]).toEqual(['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', 1]);
    expect(t.insights.generate.mock.calls).toEqual([['u1', '2026-10', { skipQuota: true }], ['u2', '2026-10', { skipQuota: true }], ['u3', '2026-10', { skipQuota: true }]]);
  });

  it('tanggal 25: hanya user dengan startDay 25, periode yang baru berakhir (25 Okt – 24 Nov = 2026-11)', async () => {
    const t = build(['u9']);
    expect(await t.job.runDaily(day('2026-11-25'))).toEqual({ period: '2026-11', generated: 1, failed: 0 });
    const [start, end, startDay] = t.repo.findActiveUserIdsWithActivity.mock.calls[0];
    expect([start.toISOString(), end.toISOString(), startDay]).toEqual(['2026-10-25T00:00:00.000Z', '2026-11-25T00:00:00.000Z', 25]);
    expect(t.insights.generate).toHaveBeenCalledWith('u9', '2026-11', { skipQuota: true });
  });

  it('akhir tahun: 25 Des menghasilkan periode 2026-12 (25 Nov – 24 Des); 1 Jan menghasilkan 2026-12 untuk startDay 1', async () => {
    const t = build(['u1']);
    expect((await t.job.runDaily(day('2026-12-25'))).period).toBe('2026-12');
    expect((await t.job.runDaily(day('2027-01-01'))).period).toBe('2026-12');
  });

  it('tanggal 29–31: tidak ada yang diproses (startDay maksimal 28)', async () => {
    const t = build();
    for (const d of ['2026-10-29', '2026-10-30', '2026-10-31']) expect(await t.job.runDaily(day(d))).toMatchObject({ generated: 0, failed: 0 });
    expect(t.repo.findActiveUserIdsWithActivity).not.toHaveBeenCalled();
  });

  it('hari tanpa user yang memulai periode: tidak ada panggilan LLM', async () => {
    const t = build([]);
    expect(await t.job.runDaily(day('2026-10-14'))).toMatchObject({ generated: 0 });
    expect(t.insights.generate).not.toHaveBeenCalled();
  });
});
