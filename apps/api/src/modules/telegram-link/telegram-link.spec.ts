import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LINK_CODE_TTL_MS, TelegramLinkService } from './telegram-link.service';
import { TelegramLinkRepository } from './telegram-link.repository';
import { TelegramBotInfo } from './telegram-bot-info';

describe('TelegramLinkService', () => {
  let repo: jest.Mocked<TelegramLinkRepository>;
  let service: TelegramLinkService;

  beforeEach(() => {
    repo = {
      findByUser: jest.fn(),
      findByChat: jest.fn(),
      deleteByUser: jest.fn(),
      deleteByChat: jest.fn(),
      replaceCode: jest.fn(),
      findActiveCode: jest.fn(),
      linkAndConsume: jest.fn(),
      deleteExpiredCodes: jest.fn(),
    } as unknown as jest.Mocked<TelegramLinkRepository>;
    const config = { get: (k: string) => (k === 'JWT_SECRET' ? 'secret-for-test' : undefined) } as unknown as ConfigService;
    const info = Object.assign(new TelegramBotInfo(), { enabled: true, username: 'finance_bot' });
    service = new TelegramLinkService(repo, config, info);
  });

  it('createCode: 6 digit, berlaku 10 menit, hanya hash yang disimpan', async () => {
    repo.findByUser.mockResolvedValue(null);
    const before = Date.now();
    const res = await service.createCode('u1');
    expect(res.code).toMatch(/^\d{6}$/);
    expect(res.botUsername).toBe('finance_bot');
    expect(res.expiresAt.getTime() - before).toBeGreaterThanOrEqual(LINK_CODE_TTL_MS - 50);
    expect(res.expiresAt.getTime() - before).toBeLessThanOrEqual(LINK_CODE_TTL_MS + 1000);

    const [userId, hash] = repo.replaceCode.mock.calls[0];
    expect(userId).toBe('u1');
    expect(hash).not.toBe(res.code);
    expect(hash).toBe(service.hash(res.code));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('createCode ditolak (409) bila akun sudah terhubung', async () => {
    repo.findByUser.mockResolvedValue({ id: 'l1' } as never);
    await expect(service.createCode('u1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.replaceCode).not.toHaveBeenCalled();
  });

  it('linkByCode: format salah tidak menyentuh DB', async () => {
    for (const bad of ['12345', '1234567', 'abcdef', '']) {
      expect(await service.linkByCode(bad, 'chat1', 'tes')).toEqual({ ok: false, reason: 'INVALID' });
    }
    expect(repo.findActiveCode).not.toHaveBeenCalled();
  });

  it('linkByCode: kode kedaluwarsa/terpakai/tidak ada (findActiveCode null) → INVALID', async () => {
    repo.findActiveCode.mockResolvedValue(null);
    expect(await service.linkByCode('123456', 'chat1', null)).toEqual({ ok: false, reason: 'INVALID' });
    expect(repo.findActiveCode.mock.calls[0][0]).toBe(service.hash('123456'));
  });

  it('linkByCode sukses: membuat link + menandai kode terpakai', async () => {
    repo.findActiveCode.mockResolvedValue({ id: 'code1', userId: 'u1' } as never);
    repo.findByChat.mockResolvedValue(null);
    repo.findByUser.mockResolvedValue(null);
    expect(await service.linkByCode(' 123456 ', 'chat1', 'mozes')).toEqual({ ok: true, userId: 'u1' });
    expect(repo.linkAndConsume).toHaveBeenCalledWith('code1', 'u1', 'chat1', 'mozes');
  });

  it('satu akun ↔ satu chat: chat sudah dipakai / akun sudah punya chat → ditolak', async () => {
    repo.findActiveCode.mockResolvedValue({ id: 'code1', userId: 'u1' } as never);
    repo.findByChat.mockResolvedValue({ id: 'l' } as never);
    expect(await service.linkByCode('123456', 'chat1', null)).toEqual({ ok: false, reason: 'CHAT_TAKEN' });

    repo.findByChat.mockResolvedValue(null);
    repo.findByUser.mockResolvedValue({ id: 'l' } as never);
    expect(await service.linkByCode('123456', 'chat1', null)).toEqual({ ok: false, reason: 'USER_LINKED' });
    expect(repo.linkAndConsume).not.toHaveBeenCalled();
  });

  it('resolveChat: mengembalikan userId & status; chat tak dikenal → null', async () => {
    repo.findByChat.mockResolvedValue({ username: 'tes', user: { id: 'u1', status: 'SUSPENDED' } } as never);
    expect(await service.resolveChat('chat1')).toEqual({ userId: 'u1', status: 'SUSPENDED', username: 'tes' });
    repo.findByChat.mockResolvedValue(null);
    expect(await service.resolveChat('chat2')).toBeNull();
  });

  it('getStatus: tidak membocorkan chatId', async () => {
    repo.findByUser.mockResolvedValue({ chatId: '999', username: 'tes', linkedAt: new Date('2026-10-23') } as never);
    const s = await service.getStatus('u1');
    expect(s.linked).toEqual({ username: 'tes', linkedAt: new Date('2026-10-23') });
    expect(JSON.stringify(s)).not.toContain('999');
  });
});
