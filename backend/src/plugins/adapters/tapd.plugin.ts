import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSourcePlugin } from '../interfaces/data-source-plugin.interface';
import { PluginFetchContext } from '../interfaces/data-source-plugin.interface';
import { PluginItem, CardTodoView } from '../types/plugin-item.type';
import { TapdService } from './tapd.service';
import { TapdConfig as TapdConfigEntity } from '../../database/entities/tapd-config.entity';

export interface TapdPluginConfig {
  apiUrl: string;
  apiToken: string;
  workspaceId: string;
}

export interface TapdFetchOptions {
  contentType?: 'all' | 'requirements' | 'bugs';
  projectId?: string;
  iterationId?: string;
  bugTitle?: string;
  versionId?: string;
  ownerIds?: string[];
  status?: string;
}

function mapTapdStatusToPluginStatus(status: string): 'todo' | 'done' | 'completed' {
  const lowerStatus = status?.toLowerCase() || '';
  if (lowerStatus === 'done' || lowerStatus === 'completed' || lowerStatus === 'closed') {
    return 'completed';
  }
  if (lowerStatus === 'in_progress' || lowerStatus === 'ongoing') {
    return 'done';
  }
  return 'todo';
}

@Injectable()
export class TapdPlugin implements DataSourcePlugin {
  type = 'tapd';

  constructor(
    private readonly tapdService: TapdService,
    @InjectRepository(TapdConfigEntity)
    private readonly tapdConfigRepository: Repository<TapdConfigEntity>,
  ) {}

  async validateConfig(config: unknown): Promise<void> {
    const tapdConfig = config as TapdPluginConfig;
    if (!tapdConfig.workspaceId) {
      throw new Error('Invalid TAPD configuration: workspaceId is required');
    }
  }

  async fetchItems(ctx: PluginFetchContext): Promise<PluginItem[]> {
    if (!this.tapdService.getConfig()) {
      const defaultConfig = await this.tapdConfigRepository.findOne({ where: { isDefault: true } });
      if (!defaultConfig) {
        return [];
      }
      this.tapdService.setConfig(defaultConfig.apiUrl, defaultConfig.apiToken, defaultConfig.workspaceId);
    }
    const config = ctx.config as TapdPluginConfig;
    const options = ctx.config as TapdFetchOptions;
    const items: PluginItem[] = [];

    const projectId = options.projectId || config.workspaceId;

    // Fetch requirements if projectId is specified
    if (projectId) {
      const contentType = options.contentType || 'all';

      if (contentType === 'all' || contentType === 'requirements') {
        const requirements = await this.tapdService.fetchRequirements({
          workspaceId: config.workspaceId,
          projectId,
          iterationId: options.iterationId,
          ownerIds: options.ownerIds,
          status: options.status,
        });

        for (const req of requirements) {
          items.push(this.mapRequirementToPluginItem(req));
        }
      }

      if (contentType === 'all' || contentType === 'bugs') {
        const bugs = await this.tapdService.fetchBugs({
          workspaceId: config.workspaceId,
          projectId,
          title: options.bugTitle,
          versionId: options.versionId,
          ownerIds: options.ownerIds,
          status: options.status,
        });

        for (const bug of bugs) {
          items.push(this.mapBugToPluginItem(bug));
        }
      }
    }

    return items;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRequirementToPluginItem(req: any): PluginItem {
    return {
      id: req.id,
      content: `${req.name}\n\n${req.description || ''}`,
      dueAt: null,
      executeAt: null,
      status: mapTapdStatusToPluginStatus(req.status),
      createdAt: new Date(req.created),
      updatedAt: new Date(req.modified),
      tags: [],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapBugToPluginItem(bug: any): PluginItem {
    return {
      id: bug.id,
      content: `[BUG] ${bug.title}\n\n${bug.description || ''}`,
      dueAt: null,
      executeAt: null,
      status: mapTapdStatusToPluginStatus(bug.status),
      createdAt: new Date(bug.created),
      updatedAt: new Date(bug.modified),
      tags: [],
    };
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
