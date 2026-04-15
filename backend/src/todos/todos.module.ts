import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../database/entities/card.entity';
import { Tag } from '../database/entities/tag.entity';
import { TodoCalendarSyncRecord } from '../database/entities/todo-calendar-sync.entity';
import { Todo } from '../database/entities/todo.entity';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Todo, Tag, TodoProgressEntry, Card, TodoCalendarSyncRecord]), OpenClawModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
