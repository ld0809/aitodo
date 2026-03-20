import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiniappBinding } from '../database/entities/miniapp-binding.entity';
import { Tag } from '../database/entities/tag.entity';
import { TodoCalendarSyncRecord } from '../database/entities/todo-calendar-sync.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { MiniappController } from './miniapp.controller';
import { MiniappService } from './miniapp.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Tag, Todo, MiniappBinding, TodoCalendarSyncRecord])],
  controllers: [MiniappController],
  providers: [MiniappService],
  exports: [MiniappService],
})
export class MiniappModule {}
