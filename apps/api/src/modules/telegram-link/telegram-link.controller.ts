import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { TelegramLinkService } from './telegram-link.service';

@Controller('telegram')
export class TelegramLinkController {
  constructor(private linkService: TelegramLinkService) {}

  @Get('status')
  status(@CurrentUser() user: CurrentUserData) {
    return this.linkService.getStatus(user.userId);
  }

  @Post('link-code')
  linkCode(@CurrentUser() user: CurrentUserData) {
    return this.linkService.createCode(user.userId);
  }

  @Delete('link')
  @HttpCode(204)
  async unlink(@CurrentUser() user: CurrentUserData) {
    await this.linkService.unlink(user.userId);
  }
}
