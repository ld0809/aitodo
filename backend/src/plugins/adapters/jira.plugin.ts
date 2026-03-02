import { Injectable } from '@nestjs/common';
import { DataSourcePlugin } from '../interfaces/data-source-plugin.interface';
import { PluginFetchContext } from '../interfaces/data-source-plugin.interface';
import { PluginItem, CardTodoView } from '../types/plugin-item.type';

export interface JiraConfig {
  apiUrl: string;
  apiToken: string;
  projectKey: string;
}

export interface JiraFetchOptions {
  projectKey?: string;
  issueType?: string;
  assignee?: string;
  status?: string;
}

/**
 * JIRA Plugin - Placeholder implementation for future JIRA integration
 * Currently returns empty results. To be implemented when JIRA API integration is needed.
 */
@Injectable()
export class JiraPlugin implements DataSourcePlugin {
  type = 'jira';

  async validateConfig(config: unknown): Promise<void> {
    const jiraConfig = config as JiraConfig;
    if (!jiraConfig.apiUrl || !jiraConfig.apiToken || !jiraConfig.projectKey) {
      throw new Error('Invalid JIRA configuration: apiUrl, apiToken, and projectKey are required');
    }
  }

  async fetchItems(_ctx: PluginFetchContext): Promise<PluginItem[]> {
    // Placeholder: Implement JIRA API integration here
    // This would fetch issues from JIRA based on the configuration
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
