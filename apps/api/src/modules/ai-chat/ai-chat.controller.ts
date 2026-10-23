import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ChatRequest, ChatRequestSchema } from 'shared';
import { CurrentUser } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUserData } from '../../common/types';
import { AiChatService } from './ai-chat.service';

@Controller('ai/chat')
export class AiChatController {
  constructor(private chat: AiChatService) {}

  @Post()
  ask(@CurrentUser() user: CurrentUserData, @Body(new ZodValidationPipe(ChatRequestSchema)) body: ChatRequest) {
    return this.chat.ask(user.userId, body.message);
  }

  @Get('history')
  history(@CurrentUser() user: CurrentUserData) {
    return this.chat.history(user.userId);
  }

  @Delete('history')
  @HttpCode(204)
  async clear(@CurrentUser() user: CurrentUserData) {
    await this.chat.clearHistory(user.userId);
  }
}
