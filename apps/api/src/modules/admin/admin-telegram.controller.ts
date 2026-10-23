import { Controller, Delete, Get, HttpCode, Logger, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../common/types';
import { LinkLockout } from '../bot/core/link-lockout';

const ChatIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'chatId tidak valid');

/** Admin: lihat dan buka kunci chat yang terkunci karena terlalu banyak kode /link yang salah. */
@Controller('admin/telegram/lockouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminTelegramController {
  private readonly logger = new Logger(AdminTelegramController.name);

  constructor(private lockout: LinkLockout) {}

  @Get()
  list() {
    return this.lockout.listLocked();
  }

  @Delete(':chatId')
  @HttpCode(204)
  unlock(@CurrentUser() admin: CurrentUserData, @Param('chatId', new ZodValidationPipe(ChatIdSchema)) chatId: string) {
    if (this.lockout.unlockChat(chatId) === 0) {
      throw new NotFoundException('Chat ini tidak sedang terkunci.');
    }
    this.logger.log(`Admin ${admin.userId} membuka kunci /link untuk chat ${chatId}.`);
  }
}
