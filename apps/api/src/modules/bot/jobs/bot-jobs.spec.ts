import { BotJobsService, DRAFT_TTL_MS, PENDING_TTL_MS } from './bot-jobs.service';

describe('BotJobsService.cleanup', () => {
  it('menghapus draft > 24 jam, input tertunda > 1 jam, dan kode link kedaluwarsa', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T10:00:00Z'));
    try {
      const transactions = { deleteExpiredDrafts: jest.fn().mockResolvedValue(2) };
      const pending = { deleteOlderThan: jest.fn().mockResolvedValue(1) };
      const links = { cleanupExpiredCodes: jest.fn().mockResolvedValue(3) };
      const job = new BotJobsService(transactions as never, pending as never, links as never);

      expect(await job.cleanup()).toEqual({ drafts: 2, pending: 1, codes: 3 });

      expect(transactions.deleteExpiredDrafts).toHaveBeenCalledWith(new Date('2026-10-22T10:00:00Z'));
      expect(pending.deleteOlderThan).toHaveBeenCalledWith(new Date('2026-10-23T09:00:00Z'));
      expect(DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000);
      expect(PENDING_TTL_MS).toBe(60 * 60 * 1000);
    } finally {
      jest.useRealTimers();
    }
  });
});
