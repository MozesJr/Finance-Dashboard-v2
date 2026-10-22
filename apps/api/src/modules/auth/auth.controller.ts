import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDtoSchema, RegisterDto } from './dto/register.dto';
import { LoginDtoSchema, LoginDto } from './dto/login.dto';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../common/types';
import { UsersService, toUserResponse } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body(new ZodValidationPipe(RegisterDtoSchema)) body: RegisterDto,
  ) {
    return this.authService.register(body);
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema)) body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(body, res);
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Sesi tidak valid, silakan login ulang');
    }
    return this.authService.refresh(refreshToken, res);
  }

  @Post('logout')
  @Public()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    return this.authService.logout(refreshToken, res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: CurrentUserData) {
    const fullUser = await this.usersService.getUserById(user.userId);
    return toUserResponse(fullUser);
  }
}
