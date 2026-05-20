import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodoAiMessage } from '../database/entities/todo-ai-message.entity';
import { TodoAiSession } from '../database/entities/todo-ai-session.entity';
import { TodoAiSuggestion } from '../database/entities/todo-ai-suggestion.entity';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { Todo } from '../database/entities/todo.entity';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { TodosModule } from '../todos/todos.module';
import { TodoAiController } from './todo-ai.controller';
import { TodoAiService } from './todo-ai.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Todo, TodoProgressEntry, TodoAiSession, TodoAiMessage, TodoAiSuggestion]),
    TodosModule,
    OpenClawModule,
  ],
  controllers: [TodoAiController],
  providers: [TodoAiService],
})
export class TodoAiModule {}
