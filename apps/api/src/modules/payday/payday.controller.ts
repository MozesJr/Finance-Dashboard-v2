import { Body, Controller, Get, Post } from '@nestjs/common';
import { PaydayActionInput, PaydayActionSchema } from 'shared';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaydayService } from './payday.service';

@Controller('payday')
export class PaydayController {
  constructor(private service: PaydayService) {}

  /** Checklist gajian periode berjalan; { checklist: null } bila belum ada gaji periode ini. */
  @Get()
  async get(@CurrentUser() user: CurrentUserData) {
    return { checklist: await this.service.getChecklist(user.userId) };
  }

  @Post('actions')
  action(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(PaydayActionSchema)) body: PaydayActionInput) {
    return this.service.runAction(user.userId, body, 'WEB');
  }
}
