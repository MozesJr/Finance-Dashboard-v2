import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AllocationService } from './allocation.service';
import { CurrentUser } from '../../common/decorators';
import { CurrentUserData } from '../../common/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AllocationQuery,
  AllocationQuerySchema,
  PhaseSchema,
  PutPhaseItemsInput,
  PutPhaseItemsSchema,
  TemplateInput,
  TemplateSchema,
  UpdatePlanInput,
  UpdatePlanSchema,
} from './dto/allocation.dto';

@Controller('savings/allocation')
export class AllocationController {
  constructor(private allocationService: AllocationService) {}

  @Get()
  report(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodValidationPipe(AllocationQuerySchema)) query: AllocationQuery,
  ) {
    return this.allocationService.report(user.userId, query);
  }

  @Get('plan')
  plan(@CurrentUser() user: CurrentUserData) {
    return this.allocationService.getPlan(user.userId);
  }

  @Post('from-template')
  fromTemplate(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodValidationPipe(TemplateSchema)) body: TemplateInput,
  ) {
    return this.allocationService.fromTemplate(user.userId, body);
  }

  @Patch()
  updatePlan(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodValidationPipe(UpdatePlanSchema)) body: UpdatePlanInput,
  ) {
    return this.allocationService.updatePlan(user.userId, body);
  }

  @Put('phases/:phase/items')
  putPhaseItems(
    @CurrentUser() user: CurrentUserData,
    @Param('phase', new ZodValidationPipe(PhaseSchema)) phase: number,
    @Body(new ZodValidationPipe(PutPhaseItemsSchema)) body: PutPhaseItemsInput,
  ) {
    return this.allocationService.putPhaseItems(user.userId, phase, body);
  }
}
