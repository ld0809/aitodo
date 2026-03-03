import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Todo } from '../database/entities/todo.entity';
import { TapdConfig } from '../database/entities/tapd-config.entity';
import { LocalTodoPlugin } from './local-todo.plugin';
import { TapdPlugin } from './adapters/tapd.plugin';
import { JiraPlugin } from './adapters/jira.plugin';
import { GitHubPlugin } from './adapters/github.plugin';
import { TapdService } from './adapters/tapd.service';
import { PluginBootstrapService } from './plugin-bootstrap.service';
import { PluginExecutor } from './plugin-executor.service';
import { PluginRegistry } from './plugin-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([Todo, TapdConfig])],
  providers: [
    PluginRegistry,
    LocalTodoPlugin,
    TapdPlugin,
    JiraPlugin,
    GitHubPlugin,
    TapdService,
    PluginBootstrapService,
    PluginExecutor,
  ],
  exports: [PluginRegistry, PluginExecutor, TapdService],
})
export class PluginsModule {}
