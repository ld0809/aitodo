import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Card } from '../database/entities/card.entity';
import { Tag } from '../database/entities/tag.entity';
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
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    private readonly dataSource: DataSource,
    private readonly pluginExecutor: PluginExecutor,
  ) {}

  async create(userId: string, dto: CreateCardDto) {
    const tags = await this.getValidatedTags(userId, dto.tagIds);

    const card = this.cardRepository.create({
      userId,
      name: dto.name,
      sortBy: dto.sortBy ?? 'due_at',
      sortOrder: dto.sortOrder ?? 'asc',
      x: dto.x ?? 0,
      y: dto.y ?? 0,
      w: dto.w ?? 4,
      h: dto.h ?? 4,
      pluginType: dto.pluginType ?? 'local_todo',
      pluginConfigJson: dto.pluginConfig ? JSON.stringify(dto.pluginConfig) : null,
      tags,
    });

    const savedCard = await this.cardRepository.save(card);
    return this.findOne(userId, savedCard.id);
  }

  async findAll(userId: string) {
    return this.cardRepository.find({
      where: { userId },
      relations: { tags: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string) {
    const card = await this.cardRepository.findOne({
      where: {
        userId,
        id,
      },
      relations: {
        tags: true,
      },
    });

    if (!card) {
      throw new NotFoundException('card not found');
    }

    return card;
  }

  async update(userId: string, id: string, dto: UpdateCardDto) {
    const card = await this.findOne(userId, id);

    if (dto.name !== undefined) {
      card.name = dto.name;
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

    await this.cardRepository.save(card);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const result = await this.cardRepository.delete({ id, userId });
    if (!result.affected) {
      throw new NotFoundException('card not found');
    }

    return { id };
  }

  async updateLayout(userId: string, id: string, dto: UpdateLayoutDto) {
    const card = await this.findOne(userId, id);
    card.x = dto.x;
    card.y = dto.y;
    card.w = dto.w;
    card.h = dto.h;

    await this.cardRepository.save(card);
    return card;
  }

  async updateDashboardLayout(userId: string, dto: UpdateDashboardLayoutDto) {
    const cardIds = dto.items.map((item) => item.id);

    await this.dataSource.transaction(async (manager) => {
      const cards = await manager.find(Card, {
        where: {
          userId,
          id: In(cardIds),
        },
      });

      if (cards.length !== cardIds.length) {
        throw new BadRequestException('one or more cards are invalid');
      }

      const itemMap = new Map(dto.items.map((item) => [item.id, item]));
      for (const card of cards) {
        const target = itemMap.get(card.id);
        if (!target) {
          continue;
        }

        card.x = target.x;
        card.y = target.y;
        card.w = target.w;
        card.h = target.h;
      }

      await manager.save(cards);
    });

    return this.findAll(userId);
  }

  async fetchCardTodos(userId: string, id: string) {
    const card = await this.findOne(userId, id);
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
}
