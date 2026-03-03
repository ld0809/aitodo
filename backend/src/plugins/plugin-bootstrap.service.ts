import { Injectable, OnModuleInit } from '@nestjs/common';
import { LocalTodoPlugin } from './local-todo.plugin';
import { PluginRegistry } from './plugin-registry.service';
import { TapdPlugin } from './adapters/tapd.plugin';
import { JiraPlugin } from './adapters/jira.plugin';
import { GitHubPlugin } from './adapters/github.plugin';

@Injectable()
export class PluginBootstrapService implements OnModuleInit {
  constructor(
    private readonly pluginRegistry: PluginRegistry,
    private readonly localTodoPlugin: LocalTodoPlugin,
    private readonly tapdPlugin: TapdPlugin,
    private readonly jiraPlugin: JiraPlugin,
    private readonly gitHubPlugin: GitHubPlugin,
  ) {}

  onModuleInit() {
    this.pluginRegistry.register(this.localTodoPlugin);
    this.pluginRegistry.register(this.tapdPlugin);
    this.pluginRegistry.register(this.jiraPlugin);
    this.pluginRegistry.register(this.gitHubPlugin);
  }
}
