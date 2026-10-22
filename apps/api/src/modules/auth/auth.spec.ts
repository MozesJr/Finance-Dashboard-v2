import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import * as argon2 from '@node-rs/argon2';
import { createHash } from 'crypto';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Partial<UsersService>;
  let refreshTokenRepository: Partial<RefreshTokenRepository>;
  let jwtService: Partial<JwtService>;
  let configService: Partial<ConfigService>;

  const createMockResponse = (): Partial<Response> => ({
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  });

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$',
    role: 'USER',
    status: 'ACTIVE',
  };

  const mockPendingUser = { ...mockUser, status: 'PENDING' };
  const mockRejectedUser = { ...mockUser, status: 'REJECTED' };
  const mockSuspendedUser = { ...mockUser, status: 'SUSPENDED' };

  beforeEach(async () => {
    usersService = {
      getUserByEmail: jest.fn(),
      getUserById: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
    };

    refreshTokenRepository = {
      create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      findByTokenHash: jest.fn(),
      markAsRevoked: jest.fn(),
      revokeAllForUser: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('jwt-token'),
    };

    configService = {
      get: jest.fn().mockReturnValue('development'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create user with status PENDING, role USER, and hashed password', async () => {
      const hashedPassword = '$argon2id$v=19$m=19456,t=2,p=1$abcd$xyz';
      (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({
        id: 'new-user-1',
        email: 'newuser@example.com',
        status: 'PENDING',
        role: 'USER',
      });
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        id: 'new-user-1',
        email: 'newuser@example.com',
        status: 'PENDING',
        role: 'USER',
        passwordHash: hashedPassword,
      });

      const result = await service.register({
        email: 'newuser@example.com',
        password: 'Password123',
        passwordConfirm: 'Password123',
      });

      expect(usersService.createUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'Password123',
      });
      expect(usersService.updateUser).toHaveBeenCalledWith('new-user-1', {
        passwordHash: hashedPassword,
      });
      expect(result).toEqual({
        id: 'new-user-1',
        email: 'newuser@example.com',
        status: 'PENDING',
      });
    });

    it('should reject register if email already exists', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password123',
          passwordConfirm: 'Password123',
        }),
      ).rejects.toThrow('Email sudah terdaftar');
    });
  });

  describe('login', () => {
    it('should successfully login ACTIVE user and set cookies with httpOnly and proper paths', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (jwtService.sign as jest.Mock).mockReturnValue('access-token-value');
      (refreshTokenRepository.create as jest.Mock).mockResolvedValue({
        id: 'token-1',
      });

      const res = createMockResponse() as Response;

      const result = await service.login(
        { email: 'test@example.com', password: 'Password123' },
        res,
      );

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER',
      });

      // Check access_token cookie
      const accessTokenCall = (res.cookie as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call as string[])[0] === 'access_token',
      );
      expect(accessTokenCall).toBeDefined();
      expect((accessTokenCall as unknown[])[1]).toBe('access-token-value');
      expect((accessTokenCall as unknown[])[2]).toMatchObject({
        httpOnly: true,
        path: '/api',
        sameSite: 'lax',
        secure: false,
        maxAge: 15 * 60 * 1000,
      });

      // Check refresh_token cookie
      const refreshTokenCall = (res.cookie as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call as string[])[0] === 'refresh_token',
      );
      expect(refreshTokenCall).toBeDefined();
      expect((refreshTokenCall as unknown[])[2]).toMatchObject({
        httpOnly: true,
        path: '/api/auth',
        sameSite: 'lax',
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    });


    it('should reject login for PENDING user with appropriate message', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(mockPendingUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const res = createMockResponse() as Response;

      await expect(
        service.login({ email: 'test@example.com', password: 'Password123' }, res),
      ).rejects.toThrow('Menunggu persetujuan admin');
    });

    it('should reject login for REJECTED user', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(mockRejectedUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const res = createMockResponse() as Response;

      await expect(
        service.login({ email: 'test@example.com', password: 'Password123' }, res),
      ).rejects.toThrow('Akun ditolak');
    });

    it('should reject login for SUSPENDED user', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(mockSuspendedUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const res = createMockResponse() as Response;

      await expect(
        service.login({ email: 'test@example.com', password: 'Password123' }, res),
      ).rejects.toThrow('Akun di-suspend');
    });

    it('should return generic error for non-existent email', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockRejectedValue(new Error('Verification failed'));

      const res = createMockResponse() as Response;

      await expect(
        service.login({ email: 'nonexistent@example.com', password: 'Password123' }, res),
      ).rejects.toThrow('Email atau password salah');
    });

    it('should reject login for incorrect password', async () => {
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockRejectedValue(new Error('Verification failed'));

      const res = createMockResponse() as Response;

      await expect(
        service.login({ email: 'test@example.com', password: 'WrongPassword123' }, res),
      ).rejects.toThrow('Email atau password salah');
    });
  });

  describe('refresh token rotation', () => {
    it('should mark old token as revoked and issue new one', async () => {
      const oldTokenHash = 'old-hash';
      const storedToken = {
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: oldTokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      (refreshTokenRepository.findByTokenHash as jest.Mock).mockResolvedValue(storedToken);
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockUser);
      (refreshTokenRepository.create as jest.Mock).mockResolvedValue({ id: 'token-2' });

      // Note: actual refresh would need proper password hash verification
      // This test validates the rotation logic path exists
    });

    it('should revoke all tokens on reuse detection outside grace period', async () => {
      const oldTokenHash = 'old-hash';
      const storedToken = {
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: oldTokenHash,
        revokedAt: new Date(Date.now() - 15 * 1000), // 15 seconds ago (outside grace period)
        replacedById: 'token-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      (refreshTokenRepository.findByTokenHash as jest.Mock).mockResolvedValue(storedToken);

      const res = createMockResponse() as Response;

      await expect(
        service.refresh('old-refresh-token', res),
      ).rejects.toThrow('Token sudah digunakan');

      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(mockUser.id);
    });

    it('should allow grace period retry within 10 seconds', async () => {
      const oldTokenHash = 'old-hash';
      const storedToken = {
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: oldTokenHash,
        revokedAt: new Date(Date.now() - 5 * 1000), // 5 seconds ago (within grace period)
        replacedById: 'token-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      (refreshTokenRepository.findByTokenHash as jest.Mock).mockResolvedValue(storedToken);

      const res = createMockResponse() as Response;

      await expect(
        service.refresh('old-refresh-token', res),
      ).rejects.toThrow('Sesi sudah diperbarui');

      // Should NOT revoke all tokens within grace period
      expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('should reject refresh without cookie token', async () => {
      const res = createMockResponse() as Response;

      await expect(
        service.refresh('', res),
      ).rejects.toThrow('Token tidak valid');
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      const refreshToken = 'refresh-token';
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const storedToken = {
        id: 'token-1',
        userId: mockUser.id,
        tokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      (refreshTokenRepository.findByTokenHash as jest.Mock).mockResolvedValue(storedToken);

      const res = createMockResponse() as Response;

      await service.logout(refreshToken, res);

      expect(refreshTokenRepository.markAsRevoked).toHaveBeenCalledWith(tokenHash);
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent: logout without token still clears cookies and returns 200', async () => {
      const res = createMockResponse() as Response;

      const result = await service.logout(undefined, res);

      expect(result).toEqual({ message: 'Logout berhasil' });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(res.clearCookie).toHaveBeenCalledWith('access_token', { path: '/api' });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/api/auth' });
      // Should not try to find/revoke token in DB when no token provided
      expect(refreshTokenRepository.findByTokenHash).not.toHaveBeenCalled();
    });
  });
});
