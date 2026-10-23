import { NotFoundException } from '@nestjs/common';
import { UpdateSettingsSchema } from 'shared';
import { PeriodsService, toPeriodInfo } from './periods.service';
import { PeriodsRepository } from './periods.repository';

describe('PeriodsService', () => {
  let repo: jest.Mocked<PeriodsRepository>;
  let service: PeriodsService;

  beforeEach(() => {
    repo = { getStartDay: jest.fn(), setStartDay: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<PeriodsRepository>;
    service = new PeriodsService(repo);
  });

  it('periode berjalan mengikuti startDay user dan tanggal WIB', async () => {
    repo.getStartDay.mockResolvedValue(25);
    expect((await service.current('u1', new Date('2026-10-24T16:59:00Z'))).key).toBe('2026-10');
    expect((await service.current('u1', new Date('2026-10-24T17:00:00Z'))).key).toBe('2026-11');
  });

  it('resolve(key) memberi rentang periode; tanpa key = periode berjalan', async () => {
    repo.getStartDay.mockResolvedValue(25);
    const p = await service.resolve('u1', '2026-11');
    expect(toPeriodInfo(p)).toEqual({ key: '2026-11', label: 'Nov 2026 (25 Okt – 24 Nov)', start: '2026-10-25', end: '2026-11-24' });
    expect(p.startDay).toBe(25);
    expect((await service.resolve('u1', undefined, new Date('2026-12-30T00:00:00Z'))).key).toBe('2027-01');
  });

  it('startDay 1 = bulan kalender (perilaku default tidak berubah)', async () => {
    repo.getStartDay.mockResolvedValue(1);
    expect(toPeriodInfo(await service.resolve('u1', '2026-02'))).toEqual({ key: '2026-02', label: 'Feb 2026', start: '2026-02-01', end: '2026-02-28' });
  });

  it('user tidak ada → 404', async () => {
    repo.getStartDay.mockResolvedValue(null);
    await expect(service.current('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateStartDay menyimpan lewat repository (yang juga menghapus cache insight) dan mengembalikan pengaturan baru', async () => {
    repo.getStartDay.mockResolvedValueOnce(1).mockResolvedValue(25);
    const res = await service.updateStartDay('u1', 25);
    expect(repo.setStartDay).toHaveBeenCalledWith('u1', 25);
    expect(res.periodStartDay).toBe(25);
    expect(res.currentPeriod.key).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('UpdateSettingsSchema', () => {
  it('menerima 1–28, menolak di luar rentang, desimal, dan non-angka', () => {
    expect(UpdateSettingsSchema.safeParse({ periodStartDay: 1 }).success).toBe(true);
    expect(UpdateSettingsSchema.safeParse({ periodStartDay: 28 }).success).toBe(true);
    for (const bad of [0, 29, -1, 2.5, '25', null]) expect(UpdateSettingsSchema.safeParse({ periodStartDay: bad }).success).toBe(false);
    expect(UpdateSettingsSchema.safeParse({}).success).toBe(false);
  });
});
