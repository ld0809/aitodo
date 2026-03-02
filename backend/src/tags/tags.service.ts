import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../database/entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  async list(userId: string) {
    return this.tagRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(userId: string, dto: CreateTagDto) {
    const existingTag = await this.tagRepository.findOne({
      where: {
        userId,
        name: dto.name,
      },
    });

    if (existingTag) {
      throw new ConflictException('tag name already exists');
    }

    const tag = this.tagRepository.create({
      userId,
      name: dto.name,
      color: dto.color ?? null,
    });

    return this.tagRepository.save(tag);
  }

  async update(userId: string, id: string, dto: UpdateTagDto) {
    const tag = await this.tagRepository.findOne({ where: { id, userId } });
    if (!tag) {
      throw new NotFoundException('tag not found');
    }

    if (dto.name && dto.name !== tag.name) {
      const existingTag = await this.tagRepository.findOne({
        where: {
          userId,
          name: dto.name,
        },
      });
      if (existingTag) {
        throw new ConflictException('tag name already exists');
      }
      tag.name = dto.name;
    }

    if (dto.color !== undefined) {
      tag.color = dto.color;
    }

    return this.tagRepository.save(tag);
  }

  async remove(userId: string, id: string) {
    const tag = await this.tagRepository.findOne({
      where: { id, userId },
      relations: {
        todos: true,
        cards: true,
      },
    });

    if (!tag) {
      throw new NotFoundException('tag not found');
    }

    if (tag.todos.length > 0 || tag.cards.length > 0) {
      throw new BadRequestException('tag is referenced by todo/card, remove relations first');
    }

    await this.tagRepository.remove(tag);
    return { id };
  }
}
