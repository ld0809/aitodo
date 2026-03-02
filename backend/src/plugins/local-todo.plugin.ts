import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Todo } from '../database/entities/todo.entity';
import { DataSourcePlugin, PluginFetchContext } from './interfaces/data-source-plugin.interface';
import { CardTodoView, PluginItem } from './types/plugin-item.type';

@Injectable()
export class LocalTodoPlugin implements DataSourcePlugin {
  type = 'local_todo';

  constructor(
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
  ) {}

  async validateConfig(_config: unknown) {
    return Promise.resolve();
  }

  async fetchItems(ctx: PluginFetchContext) {
    const tagIds = ctx.card.tags.map((tag) => tag.id);

    const queryBuilder = this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.tags', 'tag')
      .where('todo.user_id = :userId', { userId: ctx.userId })
      .andWhere('todo.deleted_at IS NULL')
      .distinct(true);

    if (tagIds.length > 0) {
      queryBuilder.andWhere('tag.id IN (:...tagIds)', { tagIds });
    }

    const todos = await queryBuilder.getMany();

    return todos.map<PluginItem>((todo) => ({
      id: todo.id,
      content: todo.content,
      dueAt: todo.dueAt,
      executeAt: todo.executeAt,
      status: todo.status,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      tags: todo.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })),
    }));
  }

  sortItems(items: PluginItem[], sortBy: string, sortOrder: 'asc' | 'desc') {
    const sortedItems = [...items];
    const order = sortOrder === 'asc' ? 1 : -1;

    sortedItems.sort((a, b) => {
      const left = this.getSortValue(a, sortBy);
      const right = this.getSortValue(b, sortBy);

      if (left === right) {
        return 0;
      }
      if (left === null) {
        return 1;
      }
      if (right === null) {
        return -1;
      }

      return left > right ? order : -order;
    });

    return sortedItems;
  }

  mapToCardView(items: PluginItem[]) {
    return items.map<CardTodoView>((item) => ({
      id: item.id,
      content: item.content,
      dueAt: item.dueAt,
      executeAt: item.executeAt,
      status: item.status,
      tags: item.tags,
    }));
  }

  private getSortValue(item: PluginItem, sortBy: string) {
    if (sortBy === 'due_at') {
      return item.dueAt?.getTime() ?? null;
    }
    if (sortBy === 'execute_at') {
      return item.executeAt?.getTime() ?? null;
    }
    if (sortBy === 'updated_at') {
      return item.updatedAt.getTime();
    }

    return item.createdAt.getTime();
  }
}
