import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApplyTodoAiSuggestionDto } from './dto/apply-todo-ai-suggestion.dto';
import { SendTodoAiMessageDto } from './dto/send-todo-ai-message.dto';
import { TodoAiService } from './todo-ai.service';

@Controller('todos/:todoId/ai')
@UseGuards(JwtAuthGuard)
export class TodoAiController {
  constructor(private readonly todoAiService: TodoAiService) {}

  @Get('session')
  getSession(@CurrentUser() user: { userId: string }, @Param('todoId') todoId: string) {
    return this.todoAiService.getSession(user.userId, todoId);
  }

  @Post('messages')
  sendMessage(
    @CurrentUser() user: { userId: string },
    @Param('todoId') todoId: string,
    @Body() dto: SendTodoAiMessageDto,
  ) {
    return this.todoAiService.sendMessage(user.userId, todoId, dto);
  }

  @Post('suggestions/:suggestionId/apply')
  applySuggestion(
    @CurrentUser() user: { userId: string },
    @Param('todoId') todoId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ApplyTodoAiSuggestionDto,
  ) {
    return this.todoAiService.applySuggestion(user.userId, todoId, suggestionId, dto);
  }
}
