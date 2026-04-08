import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { MiniappBinding } from '../database/entities/miniapp-binding.entity';
import { Tag } from '../database/entities/tag.entity';
import { TodoCalendarSyncRecord } from '../database/entities/todo-calendar-sync.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { BindMiniappByCodeDto } from './dto/bind-miniapp-by-code.dto';
import { BindMiniappDto } from './dto/bind-miniapp.dto';
import { ConfirmCalendarSyncDto } from './dto/confirm-calendar-sync.dto';
import { CalendarSyncDeviceDto } from './dto/calendar-sync-device.dto';
import { PrepareCalendarSyncDto } from './dto/prepare-calendar-sync.dto';
import { QueryMiniappHomeDto } from './dto/query-miniapp-home.dto';
import { ResolveWechatCodeDto } from './dto/resolve-wechat-code.dto';

@Injectable()
export class MiniappService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(MiniappBinding)
    private readonly miniappBindingRepository: Repository<MiniappBinding>,
    @InjectRepository(TodoCalendarSyncRecord)
    private readonly todoCalendarSyncRecordRepository: Repository<TodoCalendarSyncRecord>,
  ) {}

  async getBindingStatus(userId: string) {
    const binding = await this.miniappBindingRepository.findOne({
      where: { userId },
    });

    if (!binding) {
      return {
        bound: false,
      };
    }

    return {
      bound: true,
      binding: {
        miniOpenId: binding.miniOpenId,
        miniUnionId: binding.miniUnionId,
        miniNickname: binding.miniNickname,
        miniAvatarUrl: binding.miniAvatarUrl,
        updatedAt: binding.updatedAt,
      },
    };
  }

  async bindMiniappUser(userId: string, dto: BindMiniappDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (!user.emailVerified) {
      throw new BadRequestException('email user is not verified yet');
    }

    const normalizedOpenId = dto.miniOpenId.trim();
    if (!normalizedOpenId) {
      throw new BadRequestException('miniOpenId is required');
    }

    const openIdBinding = await this.miniappBindingRepository.findOne({
      where: {
        miniOpenId: normalizedOpenId,
      },
    });
    if (openIdBinding && openIdBinding.userId !== userId) {
      throw new BadRequestException('miniOpenId has been bound by another user');
    }

    let binding = await this.miniappBindingRepository.findOne({
      where: {
        userId,
      },
    });

    if (!binding) {
      binding = this.miniappBindingRepository.create({
        userId,
      });
    }

    binding.miniOpenId = normalizedOpenId;
    binding.miniUnionId = dto.miniUnionId?.trim() || null;
    binding.miniNickname = dto.miniNickname?.trim() || null;
    binding.miniAvatarUrl = dto.miniAvatarUrl?.trim() || null;

    const savedBinding = await this.miniappBindingRepository.save(binding);
    return {
      userId,
      miniOpenId: savedBinding.miniOpenId,
      miniUnionId: savedBinding.miniUnionId,
      miniNickname: savedBinding.miniNickname,
      miniAvatarUrl: savedBinding.miniAvatarUrl,
      updatedAt: savedBinding.updatedAt,
    };
  }

  async resolveWechatCode(dto: ResolveWechatCodeDto) {
    const session = await this.resolveWechatSession(dto.code);
    return {
      miniOpenId: session.openid,
      miniUnionId: session.unionid ?? null,
    };
  }

  async bindMiniappByCode(userId: string, dto: BindMiniappByCodeDto) {
    const session = await this.resolveWechatSession(dto.code);
    return this.bindMiniappUser(userId, {
      miniOpenId: session.openid,
      miniUnionId: session.unionid ?? undefined,
      miniNickname: dto.miniNickname,
      miniAvatarUrl: dto.miniAvatarUrl,
    });
  }

  async getHomeData(userId: string, query: QueryMiniappHomeDto) {
    const tags = await this.tagRepository.find({
      where: { userId },
      order: {
        createdAt: 'ASC',
      },
    });

    const todos = await this.getMiniappTodos(userId, {
      tagId: query.tagId,
      includeCompleted: query.includeCompleted ?? false,
      dueOnly: false,
    });

    return {
      selectedTagId: query.tagId ?? 'all',
      tags: [
        {
          id: 'all',
          name: '全部',
          fixed: true,
        },
        ...tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          fixed: false,
        })),
      ],
      todos,
    };
  }

  async prepareCalendarSync(userId: string, dto: PrepareCalendarSyncDto) {
    const deviceId = this.buildDeviceId(dto.device);
    const dueTodos = await this.getMiniappTodos(userId, {
      tagId: dto.tagId,
      includeCompleted: dto.includeCompleted ?? false,
      dueOnly: true,
    });
    const uniqueTodoIds = dto.todoIds ? Array.from(new Set(dto.todoIds)) : [];
    const scopedDueTodos =
      uniqueTodoIds.length > 0 ? dueTodos.filter((todo) => uniqueTodoIds.includes(todo.id)) : dueTodos;

    if (scopedDueTodos.length === 0) {
      return {
        deviceId,
        totalDueTodos: 0,
        alreadySyncedCount: 0,
        todosToSync: [],
      };
    }

    const existingRecords = await this.todoCalendarSyncRecordRepository.find({
      where: {
        userId,
        deviceId,
      },
    });

    const recordMap = new Map(existingRecords.map((record) => [record.todoId, record]));
    const todosToSync = scopedDueTodos.filter((todo) => {
      if (!todo.dueAt) {
        return false;
      }
      const record = recordMap.get(todo.id);
      if (!record) {
        return true;
      }
      return new Date(record.syncedDeadlineAt).getTime() !== new Date(todo.dueAt).getTime();
    });

    return {
      deviceId,
      totalDueTodos: scopedDueTodos.length,
      alreadySyncedCount: scopedDueTodos.length - todosToSync.length,
      todosToSync,
    };
  }

  async confirmCalendarSync(userId: string, dto: ConfirmCalendarSyncDto) {
    const deviceId = this.buildDeviceId(dto.device);
    const uniqueTodoIds = Array.from(new Set(dto.todoIds));

    const todos = await this.todoRepository
      .createQueryBuilder('todo')
      .where('todo.user_id = :userId', { userId })
      .andWhere('todo.id IN (:...todoIds)', { todoIds: uniqueTodoIds })
      .andWhere('todo.deleted_at IS NULL')
      .andWhere('todo.due_at IS NOT NULL')
      .getMany();

    if (todos.length !== uniqueTodoIds.length) {
      throw new BadRequestException('some todoIds are invalid or without deadline');
    }

    const upsertPayload = todos.map((todo) => ({
      userId,
      todoId: todo.id,
      deviceId,
      syncedDeadlineAt: todo.dueAt as Date,
    }));

    await this.todoCalendarSyncRecordRepository.upsert(upsertPayload, ['userId', 'todoId', 'deviceId']);

    return {
      deviceId,
      syncedCount: upsertPayload.length,
      todoIds: todos.map((todo) => todo.id),
    };
  }

  private async getMiniappTodos(
    userId: string,
    options: {
      tagId?: string;
      includeCompleted: boolean;
      dueOnly: boolean;
    },
  ) {
    const queryBuilder = this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.tags', 'tag')
      .where('todo.user_id = :userId', { userId })
      .andWhere('todo.deleted_at IS NULL')
      .distinct(true);

    if (!options.includeCompleted) {
      queryBuilder.andWhere('todo.status = :status', { status: 'todo' });
    }

    if (options.tagId) {
      queryBuilder.andWhere('tag.id = :tagId', { tagId: options.tagId });
    }

    if (options.dueOnly) {
      queryBuilder.andWhere('todo.due_at IS NOT NULL');
    }

    // 首页排序规则：
    // 1) 有截止时间优先；2) 有截止时间按截止时间升序；3) 无截止时间按创建时间倒序。
    queryBuilder
      .addSelect('CASE WHEN todo.due_at IS NULL THEN 1 ELSE 0 END', 'todo_due_priority')
      .orderBy('todo_due_priority', 'ASC')
      .addOrderBy('todo.due_at', 'ASC')
      .addOrderBy('todo.created_at', 'DESC');

    return queryBuilder.getMany();
  }

  private buildDeviceId(device: CalendarSyncDeviceDto) {
    const brand = device.brand.trim();
    const model = device.model.trim();

    if (!brand || !model) {
      throw new BadRequestException('device brand/model are required');
    }

    return `${brand}__${model}__${device.screenWidth}x${device.screenHeight}`;
  }

  private async resolveWechatSession(code: string): Promise<{
    openid: string;
    unionid?: string;
    session_key?: string;
  }> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new BadRequestException('wechat code is required');
    }

    if (this.isWechatMockEnabled()) {
      return {
        openid: `mock_openid_${normalizedCode}`,
        unionid: `mock_unionid_${normalizedCode}`,
        session_key: 'mock_session_key',
      };
    }

    const appId = process.env.WECHAT_MINIAPP_APP_ID?.trim();
    const appSecret = process.env.WECHAT_MINIAPP_APP_SECRET?.trim();
    const endpoint = (process.env.WECHAT_MINIAPP_JSCODE2SESSION_URL || 'https://api.weixin.qq.com/sns/jscode2session').trim();

    if (!appId || !appSecret) {
      throw new BadRequestException('wechat miniapp appId/appSecret are not configured');
    }

    try {
      const response = await axios.get(endpoint, {
        timeout: 8000,
        params: {
          appid: appId,
          secret: appSecret,
          js_code: normalizedCode,
          grant_type: 'authorization_code',
        },
      });
      const payload = (response.data ?? {}) as {
        errcode?: number;
        errmsg?: string;
        openid?: string;
        unionid?: string;
        session_key?: string;
      };

      if (payload.errcode && payload.errcode !== 0) {
        throw new BadRequestException(`wechat code exchange failed: ${payload.errcode} ${payload.errmsg ?? ''}`.trim());
      }
      if (!payload.openid) {
        throw new BadRequestException('wechat code exchange failed: openid is empty');
      }

      return {
        openid: payload.openid,
        unionid: payload.unionid,
        session_key: payload.session_key,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('wechat code exchange request failed');
    }
  }

  private isWechatMockEnabled() {
    const raw = process.env.MINIAPP_WECHAT_MOCK_ENABLED?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  }
}
