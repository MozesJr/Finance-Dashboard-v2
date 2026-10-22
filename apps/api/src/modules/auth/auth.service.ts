import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import { UsersService, toUserResponse } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RegisterInput, LoginInput } from 'shared';

const GRACE_PERIOD_MS = 10 * 1000; // 10 seconds

@Injectable()
export class AuthService {
  private dummyPasswordHash: string = '';

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private refreshTokenRepository: RefreshTokenRepository,
  ) {
    this.initDummyHash();
  }

  private async initDummyHash() {
    try {
      this.dummyPasswordHash = await hash('dummy-password-for-timing-attack-prevention', {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    } catch {
      this.dummyPasswordHash = await hash('dummy', {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    }
  }

  async register(input: RegisterInput) {
    const existing = await this.usersService.getUserByEmail(input.email);
    if (existing) {
      throw new BadRequestException('Email sudah terdaftar');
    }

    const passwordHash = await hash(input.password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await this.usersService.createUser({
      email: input.email,
      password: input.password,
    });

    // Update dengan password hash yang sebenarnya
    const updatedUser = await this.usersService.updateUser(user.id, { passwordHash });

    return toUserResponse(updatedUser);
  }

  async login(input: LoginInput, res: Response) {
    const user = await this.usersService.getUserByEmailWithPassword(input.email);

    // Timing attack prevention: always verify password
    const passwordToVerify = user ? input.password : 'invalid-password';
    const hashToCheck = user ? user.passwordHash : this.dummyPasswordHash;

    try {
      await verify(hashToCheck, passwordToVerify, {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    } catch {
      // Password verification failed
      throw new UnauthorizedException('Email atau password salah');
    }

    // Password is correct, check user exists and status
    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException('Menunggu persetujuan admin');
    }
    if (user.status === 'REJECTED') {
      throw new UnauthorizedException('Akun ditolak');
    }
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Akun di-suspend');
    }

    // Generate tokens
    const accessToken = this.jwtService.sign(
      { sub: user.id, role: user.role },
      { expiresIn: '15m' },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.create(user.id, refreshTokenHash, refreshTokenExpiry);

    // Set cookies
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      path: '/api',
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV') === 'production',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV') === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return toUserResponse(user);
  }

  async refresh(refreshToken: string, res: Response) {
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await this.refreshTokenRepository.findByTokenHash(refreshTokenHash);

    if (!storedToken) {
      throw new UnauthorizedException('Token tidak valid');
    }

    if (storedToken.revokedAt) {
      // Grace period check: if recently revoked and replacement token is active
      const timeSinceRevoked = Date.now() - storedToken.revokedAt.getTime();
      if (timeSinceRevoked < GRACE_PERIOD_MS && storedToken.replacedById) {
        // Race condition detected (multi-tab): return 401 without revoking all
        throw new UnauthorizedException('Sesi sudah diperbarui');
      }

      // Outside grace period: this is reuse detection
      await this.refreshTokenRepository.revokeAllForUser(storedToken.userId);
      throw new UnauthorizedException('Token sudah digunakan');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token sudah expired');
    }

    const user = await this.usersService.getUserById(storedToken.userId);

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    // Generate new access token
    const newAccessToken = this.jwtService.sign(
      { sub: user.id, role: user.role },
      { expiresIn: '15m' },
    );

    // Generate new refresh token
    const newRefreshToken = randomBytes(32).toString('base64url');
    const newRefreshTokenHash = createHash('sha256').update(newRefreshToken).digest('hex');
    const newRefreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newTokenRecord = await this.refreshTokenRepository.create(
      user.id,
      newRefreshTokenHash,
      newRefreshTokenExpiry,
    );

    // Mark old token as revoked and link to new one
    await this.refreshTokenRepository.markAsRevoked(refreshTokenHash, newTokenRecord.id);

    // Set new cookies
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      path: '/api',
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV') === 'production',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV') === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Clear old refresh token cookie (for old session cleanup)
    res.clearCookie('refresh_token', { path: '/api/auth' });

    return toUserResponse(user);
  }

  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const storedToken = await this.refreshTokenRepository.findByTokenHash(refreshTokenHash);

      if (storedToken && !storedToken.revokedAt) {
        await this.refreshTokenRepository.markAsRevoked(refreshTokenHash);
      }
    }

    res.clearCookie('access_token', { path: '/api' });
    res.clearCookie('refresh_token', { path: '/api/auth' });

    return { message: 'Logout berhasil' };
  }
}
