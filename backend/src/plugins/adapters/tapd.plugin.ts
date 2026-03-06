import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSourcePlugin } from '../interfaces/data-source-plugin.interface';
import { PluginFetchContext } from '../interfaces/data-source-plugin.interface';
import { PluginItem, CardTodoView } from '../types/plugin-item.type';
import { TapdService } from './tapd.service';
import { TapdConfig as TapdConfigEntity } from '../../database/entities/tapd-config.entity';

export interface TapdPluginConfig {
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


function sanitizeText(value: string): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapTapdStatusToDisplayLabel(status: string, statusLabelMap?: Record<string, string>): string {
  const rawStatus = sanitizeText(status || '');
  if (!rawStatus) {
    return '未知状态';
  }

  const mappedLabel = statusLabelMap?.[rawStatus] || statusLabelMap?.[rawStatus.toLowerCase()];
  if (mappedLabel) {
    return sanitizeText(mappedLabel);
  }

  const normalized = rawStatus.toLowerCase();
  const displayMap: Record<string, string> = {
    new: '新建',
    open: '待处理',
    todo: '待处理',
    pending: '待处理',
    in_progress: '开发中',
    inprogress: '开发中',
    ongoing: '开发中',
    developing: '开发中',
    processing: '处理中',
    testing: '测试中',
    resolved: '已解决',
    done: '已完成',
    completed: '已完成',
    closed: '已关闭',
    rejected: '已拒绝',
    abandoned: '已废弃',
  };

  if (displayMap[normalized]) {
    return displayMap[normalized];
  }

  if (/[\u4e00-\u9fff]/.test(rawStatus)) {
    return rawStatus;
  }

  return rawStatus.replace(/[_-]+/g, ' ');
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
    console.log('[TAPD Plugin] fetchItems called, cardId:', ctx.cardId);
    console.log('[TAPD Plugin] ctx.config:', JSON.stringify(ctx.config));
    
    if (!this.tapdService.getConfig()) {
      console.log('[TAPD Plugin] No config set, trying to find default...');
      const defaultConfig = await this.tapdConfigRepository.findOne({ where: { isDefault: true } });
      console.log('[TAPD Plugin] Default config found:', defaultConfig ? { id: defaultConfig.id, workspaceId: defaultConfig.workspaceId } : 'NULL');
      if (!defaultConfig) {
        console.log('[TAPD Plugin] No default config, returning empty');
        return [];
      }
      this.tapdService.setConfig(defaultConfig.apiUrl, defaultConfig.workspaceId);
    }
    const config = ctx.config as TapdPluginConfig;
    const options = ctx.config as TapdFetchOptions;
    const items: PluginItem[] = [];

    const projectId = options.projectId || config.workspaceId;
    console.log('[TAPD Plugin] projectId:', projectId, 'contentType:', options.contentType);

    // Fetch requirements if projectId is specified
    if (projectId) {
      const contentType = options.contentType || 'all';

      if (contentType === 'all' || contentType === 'requirements') {
        console.log('[TAPD Plugin] Fetching requirements...');
        const statusLabelMap = await this.tapdService.getStoryStatusLabelMap(config.workspaceId);
        const requirements = await this.tapdService.fetchRequirements({
          workspaceId: config.workspaceId,
          projectId,
          iterationId: options.iterationId,
          ownerIds: options.ownerIds,
          status: options.status,
        });
        console.log('[TAPD Plugin] Requirements fetched:', requirements.length, 'items');

        for (const req of requirements) {
          items.push(this.mapRequirementToPluginItem(req, statusLabelMap));
        }
      }

      if (contentType === 'all' || contentType === 'bugs') {
        console.log('[TAPD Plugin] Fetching bugs...');
        const bugs = await this.tapdService.fetchBugs({
          workspaceId: config.workspaceId,
          projectId,
          title: options.bugTitle,
          versionId: options.versionId,
          ownerIds: options.ownerIds,
          status: options.status,
        });
        console.log('[TAPD Plugin] Bugs fetched:', bugs.length, 'items');

        for (const bug of bugs) {
          items.push(this.mapBugToPluginItem(bug));
        }
      }
    }

    console.log('[TAPD Plugin] Total items returned:', items.length);
    return items;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRequirementToPluginItem(req: any, statusLabelMap?: Record<string, string>): PluginItem {
    const statusLabel = mapTapdStatusToDisplayLabel(req.status, statusLabelMap);
    const title = sanitizeText(req.name);
    return {
      id: req.id,
      content: sanitizeText(`[${statusLabel}] ${title}`),
      dueAt: null,
      executeAt: null,
      status: mapTapdStatusToPluginStatus(req.status),
      createdAt: new Date(req.created),
      updatedAt: new Date(req.modified),
      tags: [],
      url: req.url,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapBugToPluginItem(bug: any): PluginItem {
    return {
      id: bug.id,
      content: sanitizeText(`[BUG] ${bug.title}`),
      dueAt: null,
      executeAt: null,
      status: mapTapdStatusToPluginStatus(bug.status),
      createdAt: new Date(bug.created),
      updatedAt: new Date(bug.modified),
      tags: [],
      url: bug.url,
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
      url: item.url,
    }));
  }
}
