import 'dotenv/config';
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
import { TapdModule } from './tapd/tapd.module';
import { APP_ENTITIES } from './database/entity-list';
import { ReportsModule } from './reports/reports.module';
import { HealthModule } from './health/health.module';
import { MiniappModule } from './miniapp/miniapp.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OpenClawModule } from './openclaw/openclaw.module';

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

function resolveTypeormSynchronize() {
  const raw = process.env.TYPEORM_SYNCHRONIZE?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') {
    return true;
  }
  if (raw === 'false' || raw === '0') {
    return false;
  }

  return true;
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: resolveDatabasePath(),
      entities: APP_ENTITIES,
      synchronize: resolveTypeormSynchronize(),
      logging: false,
    }),
    AuthModule,
    UsersModule,
    TagsModule,
    TodosModule,
    PluginsModule,
    CardsModule,
    TapdModule,
    ReportsModule,
    HealthModule,
    MiniappModule,
    OrganizationsModule,
    OpenClawModule,
  ],
})
export class AppModule {}
