import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Todo } from '../database/entities/todo.entity';
import { LocalTodoPlugin } from './local-todo.plugin';
import { PluginBootstrapService } from './plugin-bootstrap.service';
import { PluginExecutor } from './plugin-executor.service';
import { PluginRegistry } from './plugin-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([Todo])],
  providers: [PluginRegistry, LocalTodoPlugin, PluginBootstrapService, PluginExecutor],
  exports: [PluginRegistry, PluginExecutor],
})
export class PluginsModule {}
