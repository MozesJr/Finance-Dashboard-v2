import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDtoSchema } from './dto/register.dto';
import { LoginDtoSchema } from './dto/login.dto';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const validated = RegisterDtoSchema.parse(body);
      return this.authService.register(validated);
    } catch (error) {
      throw new BadRequestException('Validasi gagal');
    }
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const validated = LoginDtoSchema.parse(body);
      return this.authService.login(validated, res);
    } catch (error) {
      throw new BadRequestException('Validasi gagal');
    }
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as any)?.refresh_token;
    if (!refreshToken) {
      throw new Error('Refresh token tidak ditemukan');
    }
    return this.authService.refresh(refreshToken, res);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as any)?.refresh_token;
    return this.authService.logout(refreshToken || '', res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return {
      id: user.userId,
      email: user.email,
      role: user.role,
    };
  }
}
