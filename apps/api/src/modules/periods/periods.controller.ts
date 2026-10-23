import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateSettingsInput, UpdateSettingsSchema } from 'shared';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PeriodsService } from './periods.service';

@Controller('settings')
export class PeriodsController {
  constructor(private periods: PeriodsService) {}

  @Get()
  get(@CurrentUser() user: CurrentUserData) {
    return this.periods.settings(user.userId);
  }

  @Patch()
  update(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(UpdateSettingsSchema)) body: UpdateSettingsInput) {
    return this.periods.updateStartDay(user.userId, body.periodStartDay);
  }
}
