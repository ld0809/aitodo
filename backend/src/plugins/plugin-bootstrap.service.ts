import { Injectable, OnModuleInit } from '@nestjs/common';
import { LocalTodoPlugin } from './local-todo.plugin';
import { PluginRegistry } from './plugin-registry.service';

@Injectable()
export class PluginBootstrapService implements OnModuleInit {
  constructor(
    private readonly pluginRegistry: PluginRegistry,
    private readonly localTodoPlugin: LocalTodoPlugin,
  ) {}

  onModuleInit() {
    this.pluginRegistry.register(this.localTodoPlugin);
  }
}
