import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../database/entities/card.entity';
import { Tag } from '../database/entities/tag.entity';
import { Todo } from '../database/entities/todo.entity';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Todo, Tag, TodoProgressEntry, Card])],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
