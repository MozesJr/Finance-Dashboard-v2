import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RefreshTokenRepository } from './refresh-token.repository';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from '../../common/strategies';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    UsersModule,
  ],
  providers: [AuthService, RefreshTokenRepository, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, RefreshTokenRepository],
})
export class AuthModule { }
