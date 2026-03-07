import { Injectable } from '@nestjs/common';
import { DataSourcePlugin } from '../interfaces/data-source-plugin.interface';
import { PluginFetchContext } from '../interfaces/data-source-plugin.interface';
import { PluginItem, CardTodoView } from '../types/plugin-item.type';

export interface GitHubConfig {
  apiUrl: string;
  token: string;
  owner: string;
  repo: string;
}

export interface GitHubFetchOptions {
  owner?: string;
  repo?: string;
  assignee?: string;
  labels?: string[];
  state?: 'open' | 'closed' | 'all';
}

/**
 * GitHub Plugin - Placeholder implementation for future GitHub integration
 * Currently returns empty results. To be implemented when GitHub API integration is needed.
 */
@Injectable()
export class GitHubPlugin implements DataSourcePlugin {
  type = 'github';

  async validateConfig(config: unknown): Promise<void> {
    const githubConfig = config as GitHubConfig;
    if (!githubConfig.apiUrl || !githubConfig.token) {
      throw new Error('Invalid GitHub configuration: apiUrl and token are required');
    }
  }

  async fetchItems(ctx: PluginFetchContext): Promise<PluginItem[]> {
    void ctx;
    // Placeholder: Implement GitHub API integration here
    // This would fetch issues/PRs from GitHub based on the configuration
    return [];
  }

  sortItems(items: PluginItem[], sortBy: string, sortOrder: 'asc' | 'desc'): PluginItem[] {
    return [...items].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'content':
          comparison = a.content.localeCompare(b.content);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  mapToCardView(items: PluginItem[]): CardTodoView[] {
    return items.map((item) => ({
      id: item.id,
      content: item.content,
      dueAt: item.dueAt,
      executeAt: item.executeAt,
      status: item.status,
      tags: item.tags,
    }));
  }
}
