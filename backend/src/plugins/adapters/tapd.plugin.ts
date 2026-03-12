import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSourcePlugin } from '../interfaces/data-source-plugin.interface';
import { PluginFetchContext } from '../interfaces/data-source-plugin.interface';
import { PluginItem, CardTodoView } from '../types/plugin-item.type';
import { TapdService } from './tapd.service';
import { TapdConfig as TapdConfigEntity } from '../../database/entities/tapd-config.entity';

export interface TapdPluginConfig {
  workspaceId?: string;
  workspaceIds?: string[];
}

export interface TapdFetchOptions {
  contentType?: 'all' | 'requirements' | 'bugs';
  projectId?: string;
  iterationId?: string;
  bugTitle?: string;
  versionId?: string;
  owners?: string[];
  ownerIds?: string[];
  status?: string;
}

function parseWorkspaceIds(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\s,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeWorkspaceIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean)));
}

function resolveWorkspaceIds(config: TapdPluginConfig): string[] {
  const fromList = Array.isArray(config.workspaceIds)
    ? config.workspaceIds.flatMap((item) => parseWorkspaceIds(String(item || '')))
    : [];
  const fromSingle = parseWorkspaceIds(config.workspaceId);
  return dedupeWorkspaceIds([...fromList, ...fromSingle]);
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
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const donePattern = /(已完成|已关闭|已拒绝|拒绝|已解决|已修复|已验证|已确认|qa已确认|bugqa已确认|qa确认|已验收|验证通过|延期|postponed|resolved|rejected|closed|done|completed|abandoned|fixed|verified)/i;
  const doingPattern = /(开发中|处理中|测试中|进行中|in_progress|inprogress|ongoing|developing|processing|testing)/i;

  if (donePattern.test(status) || donePattern.test(normalizedStatus)) {
    return 'completed';
  }
  if (doingPattern.test(status) || doingPattern.test(normalizedStatus)) {
    return 'todo';
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
    if (resolveWorkspaceIds(tapdConfig).length === 0) {
      throw new Error('Invalid TAPD configuration: workspaceId or workspaceIds is required');
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
    const workspaceIds = resolveWorkspaceIds(config);
    const items: PluginItem[] = [];

    console.log('[TAPD Plugin] workspaceIds:', workspaceIds, 'contentType:', options.contentType);

    if (workspaceIds.length === 0) {
      return [];
    }

    const contentType = options.contentType || 'all';
    const workspaceItems = await Promise.all(
      workspaceIds.map(async (workspaceId) => {
        const projectId = options.projectId || workspaceId;
        const currentItems: PluginItem[] = [];

        if (contentType === 'all' || contentType === 'requirements') {
          console.log('[TAPD Plugin] Fetching requirements...', { workspaceId, projectId });
          const statusLabelMap = await this.tapdService.getStoryStatusLabelMap(workspaceId);
          const requirements = await this.tapdService.fetchRequirements({
            workspaceId,
            projectId,
            iterationId: options.iterationId,
            owners: options.owners,
            ownerIds: options.ownerIds,
            status: options.status,
          });
          console.log('[TAPD Plugin] Requirements fetched:', requirements.length, 'items, workspaceId:', workspaceId);

          for (const req of requirements) {
            currentItems.push(this.mapRequirementToPluginItem(req, statusLabelMap, workspaceId));
          }
        }

        if (contentType === 'all' || contentType === 'bugs') {
          console.log('[TAPD Plugin] Fetching bugs...', { workspaceId, projectId });
          const bugStatusLabelMap = await this.tapdService.getBugStatusLabelMap(workspaceId);
          const bugs = await this.tapdService.fetchBugs({
            workspaceId,
            projectId,
            title: options.bugTitle,
            versionId: options.versionId,
            owners: options.owners,
            ownerIds: options.ownerIds,
            status: options.status,
          });
          console.log('[TAPD Plugin] Bugs fetched:', bugs.length, 'items, workspaceId:', workspaceId);

          for (const bug of bugs) {
            currentItems.push(this.mapBugToPluginItem(bug, bugStatusLabelMap, workspaceId));
          }
        }

        return currentItems;
      }),
    );
    items.push(...workspaceItems.flat());

    console.log('[TAPD Plugin] Total items returned:', items.length);
    return items;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRequirementToPluginItem(req: any, statusLabelMap?: Record<string, string>, workspaceId?: string): PluginItem {
    const statusLabel = mapTapdStatusToDisplayLabel(req.status, statusLabelMap);
    const title = sanitizeText(req.name);
    return {
      id: workspaceId ? `${workspaceId}:${req.id}` : req.id,
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
  private mapBugToPluginItem(bug: any, statusLabelMap?: Record<string, string>, workspaceId?: string): PluginItem {
    const statusLabel = mapTapdStatusToDisplayLabel(bug.status, statusLabelMap);
    const title = sanitizeText(bug.title);
    return {
      id: workspaceId ? `${workspaceId}:${bug.id}` : bug.id,
      content: sanitizeText(`[${statusLabel}] ${title}`),
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
