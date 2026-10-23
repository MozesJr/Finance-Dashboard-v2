import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { HealthRepository } from './health.repository';
import { ConfigService } from '@nestjs/config';
import {
  allowedOrigin,
  isCookieSecure,
  shouldWarnInsecureCookie,
} from '../../common/runtime-config';

const env = (vars: Record<string, string>) => (key: string) => vars[key];

describe('HealthService', () => {
  const config = (commit?: string) =>
    ({ get: () => commit }) as unknown as ConfigService;

  it('ok + versi dari GIT_COMMIT saat DB hidup', async () => {
    const repo = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as HealthRepository;
    const svc = new HealthService(repo, config('abc1234'));
    await expect(svc.check()).resolves.toEqual({ status: 'ok', db: 'up', version: 'abc1234' });
  });

  it('degraded saat DB gagal, tanpa membocorkan pesan error', async () => {
    const repo = {
      ping: jest.fn().mockRejectedValue(new Error('password authentication failed')),
    } as unknown as HealthRepository;
    const svc = new HealthService(repo, config());
    const res = await svc.check();
    expect(res).toEqual({ status: 'degraded', db: 'down', version: 'dev' });
    expect(JSON.stringify(res)).not.toContain('password');
  });

  it('controller mengembalikan 503 bila DB mati', async () => {
    const svc = { check: jest.fn().mockResolvedValue({ status: 'degraded', db: 'down', version: 'dev' }) };
    const ctrl = new HealthController(svc as unknown as HealthService);
    const res = { status: jest.fn() };
    await ctrl.health(res as never);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('controller tidak mengubah status saat sehat', async () => {
    const svc = { check: jest.fn().mockResolvedValue({ status: 'ok', db: 'up', version: 'x' }) };
    const ctrl = new HealthController(svc as unknown as HealthService);
    const res = { status: jest.fn() };
    await ctrl.health(res as never);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('runtime-config', () => {
  it('cookie secure: default true di production, false di dev', () => {
    expect(isCookieSecure(env({ NODE_ENV: 'production' }))).toBe(true);
    expect(isCookieSecure(env({ NODE_ENV: 'development' }))).toBe(false);
    expect(isCookieSecure(env({}))).toBe(false);
  });

  it('COOKIE_SECURE eksplisit mengalahkan default', () => {
    expect(isCookieSecure(env({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }))).toBe(false);
    expect(isCookieSecure(env({ NODE_ENV: 'development', COOKIE_SECURE: 'true' }))).toBe(true);
    expect(isCookieSecure(env({ NODE_ENV: 'production', COOKIE_SECURE: 'TRUE' }))).toBe(true);
  });

  it('nilai COOKIE_SECURE tidak dikenal jatuh ke default aman', () => {
    expect(isCookieSecure(env({ NODE_ENV: 'production', COOKIE_SECURE: 'nope' }))).toBe(true);
  });

  it('warning hanya saat production dengan COOKIE_SECURE=false', () => {
    expect(shouldWarnInsecureCookie(env({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }))).toBe(true);
    expect(shouldWarnInsecureCookie(env({ NODE_ENV: 'production' }))).toBe(false);
    expect(shouldWarnInsecureCookie(env({ NODE_ENV: 'development', COOKIE_SECURE: 'false' }))).toBe(false);
  });

  it('allowedOrigin dari APP_URL tanpa trailing slash, default Vite', () => {
    expect(allowedOrigin(env({ APP_URL: 'http://148.230.97.68:8098/' }))).toBe('http://148.230.97.68:8098');
    expect(allowedOrigin(env({}))).toBe('http://localhost:5173');
  });
});
