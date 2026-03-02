import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TagsModule } from './tags/tags.module';
import { TodosModule } from './todos/todos.module';
import { CardsModule } from './cards/cards.module';
import { PluginsModule } from './plugins/plugins.module';
import { Card } from './database/entities/card.entity';
import { EmailCode } from './database/entities/email-code.entity';
import { Tag } from './database/entities/tag.entity';
import { Todo } from './database/entities/todo.entity';
import { User } from './database/entities/user.entity';

function resolveDatabasePath() {
  const databasePath = process.env.DATABASE_PATH ?? 'data/app.db';
  if (databasePath !== ':memory:') {
    const directory = dirname(databasePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }
  return databasePath;
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: resolveDatabasePath(),
      entities: [User, EmailCode, Tag, Todo, Card],
      synchronize: true,
      logging: false,
    }),
    AuthModule,
    UsersModule,
    TagsModule,
    TodosModule,
    PluginsModule,
    CardsModule,
  ],
})
export class AppModule {}
