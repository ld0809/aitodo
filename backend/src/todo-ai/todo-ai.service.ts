import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TodoAiMessage } from '../database/entities/todo-ai-message.entity';
import { TodoAiSession } from '../database/entities/todo-ai-session.entity';
import { TodoAiSuggestion } from '../database/entities/todo-ai-suggestion.entity';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { Todo } from '../database/entities/todo.entity';
import { OpenClawService } from '../openclaw/openclaw.service';
import { TodosService } from '../todos/todos.service';
import { ApplyTodoAiSuggestionDto } from './dto/apply-todo-ai-suggestion.dto';
import { SendTodoAiMessageDto } from './dto/send-todo-ai-message.dto';

@Injectable()
export class TodoAiService {
  constructor(
    @InjectRepository(TodoAiSession)
    private readonly sessionRepository: Repository<TodoAiSession>,
    @InjectRepository(TodoAiMessage)
    private readonly messageRepository: Repository<TodoAiMessage>,
    @InjectRepository(TodoAiSuggestion)
    private readonly suggestionRepository: Repository<TodoAiSuggestion>,
    private readonly todosService: TodosService,
    private readonly openClawService: OpenClawService,
    private readonly dataSource: DataSource,
  ) {}

  async getSession(userId: string, todoId: string) {
    const todo = await this.todosService.findOne(userId, todoId);
    const session = await this.ensureSession(todo.id);
    const [messages, suggestions] = await Promise.all([
      this.messageRepository.find({
        where: { sessionId: session.id },
        order: { createdAt: 'ASC' },
      }),
      this.suggestionRepository.find({
        where: { sessionId: session.id },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return this.toSessionResponse(session, messages, suggestions);
  }

  async sendMessage(userId: string, todoId: string, dto: SendTodoAiMessageDto) {
    const normalizedMessage = dto.message.trim();
    if (!normalizedMessage) {
      throw new BadRequestException('message is required');
    }

    const todo = await this.todosService.findOne(userId, todoId);
    const session = await this.ensureSession(todo.id);
    const history = await this.messageRepository.find({
      where: { sessionId: session.id },
      order: { createdAt: 'DESC' },
      take: 8,
    });

    const userMessage = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        todoId: todo.id,
        userId,
        role: 'user',
        content: normalizedMessage,
        openClawDispatchId: null,
      }),
    );

    const result = await this.openClawService.requestTodoAiChat({
      todoId: todo.id,
      cardId: todo.cardId ?? null,
      todoContent: todo.content,
      userId,
      userIdentity: userId,
      message: normalizedMessage,
      history: history
        .reverse()
        .map((item) => ({
          role: item.role,
          content: item.content,
        })),
    });

    const assistantMessage = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        todoId: todo.id,
        userId,
        role: 'assistant',
        content: result.result,
        openClawDispatchId: result.dispatchId,
      }),
    );

    const suggestionContent = this.extractProgressSuggestion(result.result);
    const suggestions = suggestionContent
      ? [
          await this.suggestionRepository.save(
            this.suggestionRepository.create({
              sessionId: session.id,
              todoId: todo.id,
              messageId: assistantMessage.id,
              createdByUserId: userId,
              type: 'progress',
              status: 'pending',
              content: suggestionContent,
              appliedByUserId: null,
              appliedProgressEntryId: null,
              appliedAt: null,
            }),
          ),
        ]
      : [];

    session.lastMessageAt = new Date();
    await this.sessionRepository.save(session);

    return {
      session: this.toSessionSummary(session),
      userMessage,
      assistantMessage,
      suggestions,
    };
  }

  async applySuggestion(userId: string, todoId: string, suggestionId: string, dto: ApplyTodoAiSuggestionDto) {
    if (dto.target && dto.target !== 'progress') {
      throw new BadRequestException('unsupported suggestion target');
    }

    const todo = await this.todosService.findOne(userId, todoId);
    const suggestion = await this.suggestionRepository.findOne({
      where: {
        id: suggestionId,
        todoId: todo.id,
      },
    });
    if (!suggestion) {
      throw new NotFoundException('suggestion not found');
    }
    if (suggestion.status !== 'pending') {
      throw new BadRequestException('suggestion has already been handled');
    }
    if (suggestion.type !== 'progress') {
      throw new BadRequestException('unsupported suggestion type');
    }

    return this.dataSource.transaction(async (manager) => {
      const todoRepository = manager.getRepository(Todo);
      const progressRepository = manager.getRepository(TodoProgressEntry);
      const suggestionRepository = manager.getRepository(TodoAiSuggestion);

      const latestTodo = await todoRepository.findOne({ where: { id: todo.id } });
      if (!latestTodo) {
        throw new NotFoundException('todo not found');
      }

      const progress = await progressRepository.save(
        progressRepository.create({
          todoId: todo.id,
          userId,
          content: suggestion.content,
        }),
      );

      latestTodo.progressCount += 1;
      await todoRepository.save(latestTodo);

      suggestion.status = 'applied';
      suggestion.appliedByUserId = userId;
      suggestion.appliedProgressEntryId = progress.id;
      suggestion.appliedAt = new Date();
      const savedSuggestion = await suggestionRepository.save(suggestion);

      return {
        suggestion: savedSuggestion,
        progress: {
          ...progress,
          progressCount: latestTodo.progressCount,
        },
      };
    });
  }

  private async ensureSession(todoId: string) {
    const existing = await this.sessionRepository.findOne({ where: { todoId } });
    if (existing) {
      return existing;
    }

    try {
      return await this.sessionRepository.save(
        this.sessionRepository.create({
          todoId,
          sessionKey: this.buildSessionKey(todoId),
          status: 'active',
          lastMessageAt: null,
        }),
      );
    } catch {
      const raced = await this.sessionRepository.findOne({ where: { todoId } });
      if (raced) {
        return raced;
      }
      throw new BadRequestException('failed to create todo ai session');
    }
  }

  private buildSessionKey(todoId: string) {
    return `aitodo:todo:${todoId}`;
  }

  private extractProgressSuggestion(content: string) {
    const marker = '建议沉淀为进度：';
    const index = content.lastIndexOf(marker);
    if (index < 0) {
      return null;
    }

    const suggestion = content.slice(index + marker.length).trim();
    return suggestion.length > 0 ? suggestion : null;
  }

  private toSessionResponse(session: TodoAiSession, messages: TodoAiMessage[], suggestions: TodoAiSuggestion[]) {
    return {
      session: this.toSessionSummary(session),
      messages,
      suggestions,
    };
  }

  private toSessionSummary(session: TodoAiSession) {
    return {
      id: session.id,
      todoId: session.todoId,
      sessionKey: session.sessionKey,
      status: session.status,
      lastMessageAt: session.lastMessageAt?.toISOString() ?? null,
      createdAt: session.createdAt?.toISOString() ?? null,
      updatedAt: session.updatedAt?.toISOString() ?? null,
    };
  }
}
