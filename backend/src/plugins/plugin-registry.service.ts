import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSourcePlugin } from './interfaces/data-source-plugin.interface';

@Injectable()
export class PluginRegistry {
  private readonly plugins = new Map<string, DataSourcePlugin>();

  register(plugin: DataSourcePlugin) {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: string) {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new NotFoundException(`plugin not found: ${type}`);
    }
    return plugin;
  }
}
