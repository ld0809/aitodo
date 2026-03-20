import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Card } from '../database/entities/card.entity';
import { Tag } from '../database/entities/tag.entity';
import { TodoCalendarSyncRecord } from '../database/entities/todo-calendar-sync.entity';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { CreateTodoProgressDto } from './dto/create-todo-progress.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { QueryTodosDto } from './dto/query-todos.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(TodoProgressEntry)
    private readonly todoProgressRepository: Repository<TodoProgressEntry>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(TodoCalendarSyncRecord)
    private readonly todoCalendarSyncRecordRepository: Repository<TodoCalendarSyncRecord>,
  ) {}

  async create(userId: string, dto: CreateTodoDto) {
    const tags = await this.getValidatedTags(userId, dto.tagIds);
    let card: Card | null = null;
    let assignees: User[] = [];

    if (dto.cardId) {
      card = await this.cardRepository.findOne({
        where: { id: dto.cardId },
        relations: {
          participants: true,
        },
      });

      if (!card) {
        throw new NotFoundException('card not found');
      }

      if (card.userId !== userId) {
        throw new ForbiddenException('only card owner can create todo in this card');
      }

      if (card.cardType === 'shared') {
        assignees = this.resolveMentionedParticipants(dto.content, card.participants ?? []);
      }
    }

    const todo = this.todoRepository.create({
      userId,
      cardId: card?.id ?? null,
      content: dto.content,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      executeAt: dto.executeAt ? new Date(dto.executeAt) : null,
      status: dto.status ?? 'todo',
      deletedAt: null,
      tags,
      assignees,
    });

    const savedTodo = await this.todoRepository.save(todo);
    return this.findOne(userId, savedTodo.id);
  }

  async findAll(userId: string, query: QueryTodosDto) {
    const queryBuilder = this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.tags', 'tag')
      .leftJoinAndSelect('todo.assignees', 'assignee')
      .where('todo.user_id = :userId', { userId })
      .andWhere('todo.deleted_at IS NULL')
      .distinct(true);

    if (query.status) {
      queryBuilder.andWhere('todo.status = :status', { status: query.status });
    }

    if (query.tag_ids) {
      const tagIds = query.tag_ids
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (tagIds.length > 0) {
        queryBuilder.andWhere('tag.id IN (:...tagIds)', { tagIds });
      }
    }

    if (query.due_from) {
      queryBuilder.andWhere('todo.due_at >= :dueFrom', { dueFrom: new Date(query.due_from) });
    }

    if (query.due_to) {
      queryBuilder.andWhere('todo.due_at <= :dueTo', { dueTo: new Date(query.due_to) });
    }

    const sortColumnMap: Record<string, string> = {
      due_at: 'todo.due_at',
      created_at: 'todo.created_at',
      execute_at: 'todo.execute_at',
      updated_at: 'todo.updated_at',
    };

    const sortBy = query.sort_by ?? 'created_at';
    const sortOrder = (query.sort_order ?? 'desc').toUpperCase() as 'ASC' | 'DESC';
    queryBuilder.orderBy(sortColumnMap[sortBy], sortOrder);

    return queryBuilder.getMany();
  }

  async findToday(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.tags', 'tag')
      .leftJoinAndSelect('todo.assignees', 'assignee')
      .where('todo.user_id = :userId', { userId })
      .andWhere('todo.deleted_at IS NULL')
      .andWhere('todo.due_at >= :today', { today })
      .andWhere('todo.due_at < :tomorrow', { tomorrow })
      .orderBy('todo.due_at', 'ASC')
      .getMany();
  }

  async findWeek(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.tags', 'tag')
      .leftJoinAndSelect('todo.assignees', 'assignee')
      .where('todo.user_id = :userId', { userId })
      .andWhere('todo.deleted_at IS NULL')
      .andWhere('todo.due_at >= :today', { today })
      .andWhere('todo.due_at < :weekEnd', { weekEnd })
      .orderBy('todo.due_at', 'ASC')
      .getMany();
  }

  async findOne(userId: string, id: string) {
    return this.findAccessibleTodoOrThrow(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    const todo = await this.findAccessibleTodoOrThrow(userId, id);
    if (todo.userId !== userId) {
      throw new ForbiddenException('only todo owner can update todo');
    }

    let dueAtChanged = false;

    if (dto.content !== undefined) {
      todo.content = dto.content;
      await this.refreshSharedTodoAssignees(todo);
    }
    if (dto.dueAt !== undefined) {
      const nextDueAt = new Date(dto.dueAt);
      const previousDueAtTs = todo.dueAt ? new Date(todo.dueAt).getTime() : null;
      const nextDueAtTs = nextDueAt.getTime();
      dueAtChanged = previousDueAtTs !== nextDueAtTs;
      todo.dueAt = nextDueAt;
    }
    if (dto.executeAt !== undefined) {
      todo.executeAt = new Date(dto.executeAt);
    }
    if (dto.status !== undefined) {
      todo.status = dto.status as 'todo' | 'done' | 'completed';
    }
    if (dto.tagIds !== undefined) {
      todo.tags = await this.getValidatedTags(userId, dto.tagIds);
    }

    await this.todoRepository.save(todo);
    if (dueAtChanged) {
      await this.todoCalendarSyncRecordRepository.delete({ todoId: todo.id });
    }
    return this.findOne(userId, id);
  }

  async complete(userId: string, id: string, completed: boolean) {
    const todo = await this.findAccessibleTodoOrThrow(userId, id);

    todo.status = completed ? 'done' : 'todo';
    todo.completedAt = completed ? new Date() : null;
    await this.todoRepository.save(todo);

    return {
      id: todo.id,
      status: todo.status,
      completedAt: todo.completedAt,
    };
  }

  async remove(userId: string, id: string) {
    const todo = await this.findAccessibleTodoOrThrow(userId, id);
    if (todo.userId !== userId) {
      throw new ForbiddenException('only todo owner can delete todo');
    }

    todo.deletedAt = new Date();
    await this.todoRepository.save(todo);
    await this.todoCalendarSyncRecordRepository.delete({ todoId: todo.id });

    return { id };
  }

  async findProgress(userId: string, id: string) {
    const todo = await this.findOne(userId, id);
    return this.todoProgressRepository.find({
      where: {
        todoId: todo.id,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async createProgress(userId: string, id: string, dto: CreateTodoProgressDto) {
    const todo = await this.findOne(userId, id);
    const normalizedContent = dto.content.trim();
    if (!normalizedContent) {
      throw new BadRequestException('progress content is required');
    }

    const entry = this.todoProgressRepository.create({
      userId,
      todoId: todo.id,
      content: normalizedContent,
    });
    const savedEntry = await this.todoProgressRepository.save(entry);

    todo.progressCount += 1;
    await this.todoRepository.save(todo);

    return {
      ...savedEntry,
      progressCount: todo.progressCount,
    };
  }

  private async getValidatedTags(userId: string, tagIds?: string[]) {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    const tags = await this.tagRepository.find({
      where: {
        userId,
        id: In(tagIds),
      },
    });

    if (tags.length !== tagIds.length) {
      throw new BadRequestException('one or more tags are invalid');
    }

    return tags;
  }

  private async findAccessibleTodoOrThrow(userId: string, id: string) {
    const todo = await this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.tags', 'tag')
      .leftJoinAndSelect('todo.assignees', 'assignee')
      .leftJoinAndSelect('todo.card', 'card')
      .leftJoin('todo.assignees', 'accessAssignee')
      .where('todo.id = :id', { id })
      .andWhere('todo.deleted_at IS NULL')
      .andWhere('(todo.user_id = :userId OR accessAssignee.id = :userId)', { userId })
      .distinct(true)
      .getOne();

    if (!todo) {
      throw new NotFoundException('todo not found');
    }

    return todo;
  }

  private resolveMentionedParticipants(content: string, participants: User[]) {
    if (!content || participants.length === 0) {
      return [];
    }

    const mentionTokens = this.extractMentionTokens(content);
    if (mentionTokens.size === 0) {
      return [];
    }

    return participants.filter((participant) => mentionTokens.has(this.buildMentionKey(participant).toLowerCase()));
  }

  private async refreshSharedTodoAssignees(todo: Todo) {
    if (!todo.cardId) {
      return;
    }

    const card = await this.cardRepository.findOne({
      where: { id: todo.cardId },
      relations: {
        participants: true,
      },
    });
    if (!card || card.cardType !== 'shared') {
      return;
    }

    todo.assignees = this.resolveMentionedParticipants(todo.content, card.participants ?? []);
  }

  private extractMentionTokens(content: string) {
    const tokens = new Set<string>();
    const mentionRegex = /@([^\s@,.;:!?()[\]{}"'`]+)/g;
    let match: RegExpExecArray | null = mentionRegex.exec(content);

    while (match) {
      const rawToken = match[1]?.trim().toLowerCase();
      if (rawToken) {
        tokens.add(rawToken);
      }
      match = mentionRegex.exec(content);
    }

    return tokens;
  }

  private buildMentionKey(user: Pick<User, 'email' | 'nickname'>) {
    const trimmedNickname = user.nickname?.trim().replace(/\s+/g, '');
    if (trimmedNickname) {
      return trimmedNickname;
    }
    return user.email.split('@')[0] ?? user.email;
  }
}
