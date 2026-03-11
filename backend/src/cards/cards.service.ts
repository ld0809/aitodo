import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { Card } from '../database/entities/card.entity';
import { CardUserLayout } from '../database/entities/card-user-layout.entity';
import { Tag } from '../database/entities/tag.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { PluginExecutor } from '../plugins/plugin-executor.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { UpdateDashboardLayoutDto } from './dto/update-dashboard-layout.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(CardUserLayout)
    private readonly cardUserLayoutRepository: Repository<CardUserLayout>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    private readonly dataSource: DataSource,
    private readonly pluginExecutor: PluginExecutor,
  ) {}

  async create(userId: string, dto: CreateCardDto) {
    const tags = await this.getValidatedTags(userId, dto.tagIds);
    const cardType = dto.cardType ?? 'personal';
    const pluginType = dto.pluginType ?? 'local_todo';
    this.validateCardTypeAndPlugin(cardType, pluginType);
    const participants = await this.resolveParticipants(cardType, dto.participantEmails);

    const card = this.cardRepository.create({
      userId,
      name: dto.name,
      cardType,
      sortBy: dto.sortBy ?? 'due_at',
      sortOrder: dto.sortOrder ?? 'asc',
      x: dto.x ?? 0,
      y: dto.y ?? 0,
      w: dto.w ?? 4,
      h: dto.h ?? 4,
      pluginType,
      pluginConfigJson: dto.pluginConfig ? JSON.stringify(dto.pluginConfig) : null,
      tags,
      participants,
    });

    const savedCard = await this.cardRepository.save(card);
    return this.findOne(userId, savedCard.id);
  }

  async findAll(userId: string) {
    const cards = await this.cardRepository
      .createQueryBuilder('card')
      .leftJoinAndSelect('card.tags', 'tag')
      .leftJoinAndSelect('card.participants', 'participant')
      .where('card.user_id = :userId', { userId })
      .orWhere(
        `
          card.card_type = :sharedType
          AND EXISTS (
            SELECT 1
            FROM todos visible_todo
            INNER JOIN todo_assignees visible_assignee
              ON visible_assignee.todo_id = visible_todo.id
            WHERE visible_todo.card_id = card.id
              AND visible_todo.deleted_at IS NULL
              AND visible_assignee.user_id = :userId
          )
        `,
        { sharedType: 'shared', userId },
      )
      .orderBy('card.created_at', 'DESC')
      .distinct(true)
      .getMany();

    const cardsWithUserLayout = await this.applyUserLayouts(userId, cards);
    return cardsWithUserLayout.map((card) => this.toCardResponse(card));
  }

  async findOne(userId: string, id: string) {
    const card = await this.findAccessibleCardOrThrow(userId, id);
    const [cardWithUserLayout] = await this.applyUserLayouts(userId, [card]);
    return this.toCardResponse(cardWithUserLayout ?? card);
  }

  async update(userId: string, id: string, dto: UpdateCardDto) {
    const card = await this.findOwnedCardOrThrow(userId, id);
    const previousCardType = card.cardType;

    const nextCardType = dto.cardType ?? card.cardType;
    const nextPluginType = dto.pluginType ?? card.pluginType;
    this.validateCardTypeAndPlugin(nextCardType, nextPluginType);

    if (dto.name !== undefined) {
      card.name = dto.name;
    }
    if (dto.cardType !== undefined) {
      card.cardType = dto.cardType;
    }
    if (dto.sortBy !== undefined) {
      card.sortBy = dto.sortBy;
    }
    if (dto.sortOrder !== undefined) {
      card.sortOrder = dto.sortOrder;
    }
    if (dto.x !== undefined) {
      card.x = dto.x;
    }
    if (dto.y !== undefined) {
      card.y = dto.y;
    }
    if (dto.w !== undefined) {
      card.w = dto.w;
    }
    if (dto.h !== undefined) {
      card.h = dto.h;
    }
    if (dto.pluginType !== undefined) {
      card.pluginType = dto.pluginType;
    }
    if (dto.pluginConfig !== undefined) {
      card.pluginConfigJson = JSON.stringify(dto.pluginConfig);
    }
    if (dto.tagIds !== undefined) {
      card.tags = await this.getValidatedTags(userId, dto.tagIds);
    }

    if (nextCardType !== 'shared') {
      card.participants = [];
    } else if (dto.participantEmails !== undefined) {
      card.participants = await this.resolveParticipants('shared', dto.participantEmails);
    } else if (previousCardType !== 'shared' && nextCardType === 'shared') {
      card.participants = [];
    }

    await this.cardRepository.save(card);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOwnedCardOrThrow(userId, id);
    await this.cardRepository.delete({ id });

    return { id };
  }

  async updateLayout(userId: string, id: string, dto: UpdateLayoutDto) {
    await this.findAccessibleCardOrThrow(userId, id);
    await this.saveUserLayouts(userId, [{ id, x: dto.x, y: dto.y, w: dto.w, h: dto.h }]);
    return this.findOne(userId, id);
  }

  async updateDashboardLayout(userId: string, dto: UpdateDashboardLayoutDto) {
    const itemMap = new Map(dto.items.map((item) => [item.id, item]));
    const cardIds = [...itemMap.keys()];
    if (cardIds.length === 0) {
      return this.findAll(userId);
    }
    await this.validateDashboardLayoutCards(userId, cardIds);

    await this.dataSource.transaction(async (manager) => {
      await this.saveUserLayouts(
        userId,
        cardIds.map((cardId) => {
          const item = itemMap.get(cardId)!;
          return {
            id: cardId,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          };
        }),
        manager,
      );
    });

    return this.findAll(userId);
  }

  async fetchCardTodos(userId: string, id: string) {
    const card = await this.findAccessibleCardOrThrow(userId, id);
    return this.pluginExecutor.fetchCardTodos(userId, card);
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

  private async findOwnedCardOrThrow(userId: string, id: string) {
    const card = await this.cardRepository.findOne({
      where: {
        id,
        userId,
      },
      relations: {
        tags: true,
        participants: true,
      },
    });

    if (!card) {
      throw new NotFoundException('card not found');
    }

    return card;
  }

  private async findAccessibleCardOrThrow(userId: string, id: string) {
    const card = await this.cardRepository.findOne({
      where: { id },
      relations: {
        tags: true,
        participants: true,
      },
    });

    if (!card) {
      throw new NotFoundException('card not found');
    }

    if (card.userId === userId) {
      return card;
    }

    if (card.cardType !== 'shared') {
      throw new NotFoundException('card not found');
    }

    const assignedCount = await this.todoRepository
      .createQueryBuilder('todo')
      .innerJoin('todo.assignees', 'assignee')
      .where('todo.card_id = :cardId', { cardId: id })
      .andWhere('todo.deleted_at IS NULL')
      .andWhere('assignee.id = :userId', { userId })
      .getCount();

    if (assignedCount === 0) {
      throw new NotFoundException('card not found');
    }

    return card;
  }

  private async validateDashboardLayoutCards(userId: string, cardIds: string[]) {
    const accessibleCards = await this.cardRepository
      .createQueryBuilder('card')
      .where('card.id IN (:...cardIds)', { cardIds })
      .andWhere(
        new Brackets((qb) => {
          qb.where('card.user_id = :userId', { userId }).orWhere(
            `
              card.card_type = :sharedType
              AND EXISTS (
                SELECT 1
                FROM todos visible_todo
                INNER JOIN todo_assignees visible_assignee
                  ON visible_assignee.todo_id = visible_todo.id
                WHERE visible_todo.card_id = card.id
                  AND visible_todo.deleted_at IS NULL
                  AND visible_assignee.user_id = :userId
              )
            `,
            { sharedType: 'shared', userId },
          );
        }),
      )
      .select(['card.id'])
      .getMany();

    if (accessibleCards.length !== cardIds.length) {
      throw new BadRequestException('one or more cards are invalid');
    }
  }

  private validateCardTypeAndPlugin(cardType: 'personal' | 'shared', pluginType: string) {
    if (cardType === 'shared' && pluginType !== 'local_todo') {
      throw new BadRequestException('shared card only supports local_todo plugin');
    }
  }

  private async resolveParticipants(cardType: 'personal' | 'shared', participantEmails?: string[]) {
    if (cardType !== 'shared') {
      return [];
    }

    const normalizedEmails = [...new Set((participantEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (normalizedEmails.length === 0) {
      return [];
    }

    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) IN (:...emails)', { emails: normalizedEmails })
      .getMany();

    if (users.length !== normalizedEmails.length) {
      const matchedSet = new Set(users.map((user) => user.email.toLowerCase()));
      const invalidEmails = normalizedEmails.filter((email) => !matchedSet.has(email));
      throw new BadRequestException(`以下参与人邮箱尚未注册，请先注册后再添加：${invalidEmails.join(', ')}`);
    }

    const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
    return normalizedEmails.map((email) => userByEmail.get(email)!);
  }

  private async applyUserLayouts(userId: string, cards: Card[]) {
    if (cards.length === 0) {
      return cards;
    }

    const cardIds = cards.map((card) => card.id);
    const layouts = await this.cardUserLayoutRepository.find({
      where: {
        userId,
        cardId: In(cardIds),
      },
    });
    if (layouts.length === 0) {
      return cards;
    }

    const layoutByCardId = new Map(layouts.map((layout) => [layout.cardId, layout]));
    for (const card of cards) {
      const layout = layoutByCardId.get(card.id);
      if (!layout) {
        continue;
      }
      card.x = layout.x;
      card.y = layout.y;
      card.w = layout.w;
      card.h = layout.h;
    }

    return cards;
  }

  private async saveUserLayouts(
    userId: string,
    items: Array<{ id: string; x: number; y: number; w: number; h: number }>,
    manager?: EntityManager,
  ) {
    if (items.length === 0) {
      return;
    }

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const cardIds = [...itemMap.keys()];
    const targetManager = manager ?? this.dataSource.manager;
    const existingLayouts = await targetManager.find(CardUserLayout, {
      where: {
        userId,
        cardId: In(cardIds),
      },
    });
    const existingByCardId = new Map(existingLayouts.map((layout) => [layout.cardId, layout]));

    const layoutsToSave = cardIds.map((cardId) => {
      const item = itemMap.get(cardId)!;
      const existingLayout = existingByCardId.get(cardId);
      if (existingLayout) {
        existingLayout.x = item.x;
        existingLayout.y = item.y;
        existingLayout.w = item.w;
        existingLayout.h = item.h;
        return existingLayout;
      }

      return targetManager.create(CardUserLayout, {
        userId,
        cardId,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      });
    });

    await targetManager.save(CardUserLayout, layoutsToSave);
  }

  private toCardResponse(card: Card) {
    return {
      ...card,
      participants: (card.participants ?? []).map((participant) => ({
        id: participant.id,
        email: participant.email,
        nickname: participant.nickname,
        mentionKey: this.buildMentionKey(participant),
      })),
    };
  }

  private buildMentionKey(user: Pick<User, 'email' | 'nickname'>) {
    const trimmedNickname = user.nickname?.trim().replace(/\s+/g, '');
    if (trimmedNickname) {
      return trimmedNickname;
    }
    return user.email.split('@')[0] ?? user.email;
  }
}
