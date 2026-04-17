/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

export interface TapdRequirement {
  iterationId?: string;
  id: string;
  name: string;
  description: string;
  status: string;
  owner: string;
  ownerNames: string[];
  created: string;
  modified: string;
  url: string;
}

export interface TapdBug {
  iterationId?: string;
  id: string;
  title: string;
  description: string;
  status: string;
  owner: string;
  ownerNames: string[];
  created: string;
  modified: string;
  url: string;
  version: string;
}

export interface TapdDetailPayload {
  kind: 'story' | 'bug';
  workspaceId: string;
  id: string;
  title: string;
  description: string;
  status: string;
  owner: string;
  ownerNames: string[];
  created: string;
  modified: string;
  url: string;
  iterationName?: string;
  version?: string;
  priority?: string;
  severity?: string;
}

function splitTapdOwnerText(value: string): string[] {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[,\uFF0C;\uFF1B|\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectTapdOwnerNames(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTapdOwnerNames(item));
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return splitTapdOwnerText(String(value));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredName =
      record.name ??
      record.user ??
      record.realname ??
      record.nickname ??
      record.display_name ??
      record.label ??
      record.text;

    if (preferredName !== undefined) {
      return collectTapdOwnerNames(preferredName);
    }
  }

  return [];
}

function extractTapdOwnerNames(item: Record<string, unknown>): string[] {
  const candidates = [
    item.owner,
    item.owners,
    item.owner_name,
    item.owner_names,
    item.current_owner,
    item.current_owner_name,
    item.current_owners,
    item.current_owner_names,
    item.handler,
    item.handlers,
    item.processor,
    item.processors,
  ];

  return Array.from(
    new Set(
      candidates
        .flatMap((candidate) => collectTapdOwnerNames(candidate))
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeTapdDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeTapdDisplayValue(item))
      .filter(Boolean)
      .join(' / ')
      .trim();
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredCandidates = [
      record.name,
      record.title,
      record.label,
      record.text,
      record.value,
      record.display_name,
      record.iteration_name,
      record.version_name,
      record.release_name,
      record.priority_name,
      record.severity_name,
    ];

    for (const candidate of preferredCandidates) {
      const normalized = normalizeTapdDisplayValue(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return '';
}

function pickFirstTapdText(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const normalized = normalizeTapdDisplayValue(item[key]);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export function normalizeTapdQueryValues(value?: string | string[]): string[] {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value)
    ? value
    : String(value)
        .split(/[,\uFF0C|]/)
        .map((item) => item.trim())
        .filter(Boolean);

  return Array.from(new Set(rawValues.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function buildTapdUserFilter(value?: string | string[]): string | undefined {
  const values = normalizeTapdQueryValues(value);
  if (values.length === 0) {
    return undefined;
  }

  if (values.length === 1) {
    return values[0];
  }

  return `USER_OR<${values.join('|')}>`;
}

export function applyTapdStatusFilter(queryParams: Record<string, string>, status?: string | string[]) {
  const values = normalizeTapdQueryValues(status);
  if (values.length === 0) {
    return;
  }

  const serializedValue = values.join('|');
  if (values.some((item) => /[\u4e00-\u9fff]/.test(item))) {
    queryParams.v_status = serializedValue;
    return;
  }

  queryParams.status = serializedValue;
}

export interface TapdProject {
  id: string;
  name: string;
  description: string;
}

export interface TapdIteration {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface TapdUser {
  id: string;
  name: string;
  email: string;
}

export interface TapdVersion {
  id: string;
  name: string;
  status: string;
}

export interface FetchRequirementsParams {
  workspaceId: string;
  projectId?: string;
  iterationId?: string;
  owners?: string[];
  ownerIds?: string[];
  status?: string;
}

export interface FetchBugsParams {
  workspaceId: string;
  projectId?: string;
  iterationId?: string;
  title?: string;
  versionId?: string;
  owners?: string[];
  ownerIds?: string[];
  status?: string;
}

@Injectable()
export class TapdService {
  private readonly logger = new Logger(TapdService.name);
  private readonly pageSize = 100;
  private readonly maxPages = 20;
  private client: any = null;
  private config: { apiUrl: string; apiUser: string; workspaceId: string } | null = null;
  private doneStoryStatusesCache = new Map<string, Set<string>>();
  private doneBugStatusesCache = new Map<string, Set<string>>();
  private storyStatusOptionsCache = new Map<string, Record<string, string>>();
  private bugStatusOptionsCache = new Map<string, Record<string, string>>();
  private storyFieldsInfoCache = new Map<string, Record<string, unknown>>();
  private bugFieldsInfoCache = new Map<string, Record<string, unknown>>();
  private workspaceUserAccountMapCache = new Map<string, Map<string, string>>();

  private resolveTapdOptionLabel(value: unknown, options: Record<string, string>): string {
    const normalizedValue = normalizeTapdDisplayValue(value);
    if (!normalizedValue) {
      return '';
    }

    return options[normalizedValue] || options[normalizedValue.toLowerCase()] || normalizedValue;
  }

  private extractTapdFieldOptions(
    fieldsInfo: Record<string, unknown>,
    fieldKeys: string[],
  ): Record<string, string> {
    for (const fieldKey of fieldKeys) {
      const fieldInfo = fieldsInfo[fieldKey];
      if (!fieldInfo || typeof fieldInfo !== 'object') {
        continue;
      }

      const fieldRecord = fieldInfo as Record<string, unknown>;
      const candidateOptions =
        fieldRecord.options ??
        fieldRecord.value_options ??
        fieldRecord.enum_options ??
        fieldRecord.select_options ??
        {};
      const normalizedOptions = this.normalizeStatusOptions(candidateOptions);
      if (Object.keys(normalizedOptions).length > 0) {
        return normalizedOptions;
      }
    }

    return {};
  }

  private async getStoryFieldsInfo(workspaceId: string): Promise<Record<string, unknown>> {
    if (this.storyFieldsInfoCache.has(workspaceId)) {
      return this.storyFieldsInfoCache.get(workspaceId) || {};
    }

    const response = await this.client.get(`/stories/get_fields_info?workspace_id=${workspaceId}`);
    const fieldsInfo = (response.data?.data ?? response.data ?? {}) as Record<string, unknown>;
    this.storyFieldsInfoCache.set(workspaceId, fieldsInfo);
    return fieldsInfo;
  }

  private async getBugFieldsInfo(workspaceId: string): Promise<Record<string, unknown>> {
    if (this.bugFieldsInfoCache.has(workspaceId)) {
      return this.bugFieldsInfoCache.get(workspaceId) || {};
    }

    const response = await this.client.get(`/bugs/get_fields_info?workspace_id=${workspaceId}`);
    const fieldsInfo = (response.data?.data ?? response.data ?? {}) as Record<string, unknown>;
    this.bugFieldsInfoCache.set(workspaceId, fieldsInfo);
    return fieldsInfo;
  }

  private async getWorkspaceUserAccountMap(workspaceId: string): Promise<Map<string, string>> {
    if (this.workspaceUserAccountMapCache.has(workspaceId)) {
      return this.workspaceUserAccountMapCache.get(workspaceId) || new Map<string, string>();
    }

    const accountMap = new Map<string, string>();
    try {
      const response = await this.client.get('/workspaces/users', {
        params: {
          workspace_id: workspaceId,
          fields: 'user,user_id,name,email',
        },
      });
      const payload = response.data?.data ?? response.data ?? [];
      const rawList = Array.isArray(payload) ? payload : [];
      const users = rawList.map((item: any) => item?.UserWorkspace || item);

      for (const item of users) {
        const user = String(item?.user || '').trim();
        if (!user) continue;

        accountMap.set(user, user);
        accountMap.set(user.toLowerCase(), user);

        const userId = String(item?.user_id || '').trim();
        if (userId) {
          accountMap.set(userId, user);
        }

        const name = String(item?.name || '').trim();
        if (name) {
          accountMap.set(name, user);
        }
      }
    } catch {
      console.warn('Failed to load TAPD workspace users for owner mapping, fallback to raw owner values.');
    }

    this.workspaceUserAccountMapCache.set(workspaceId, accountMap);
    return accountMap;
  }

  private async resolveOwnerAccounts(workspaceId: string, ownerIds?: string[]): Promise<string[]> {
    if (!ownerIds || ownerIds.length === 0) {
      return [];
    }

    const normalizedOwners = ownerIds.map((item) => String(item || '').trim()).filter(Boolean);
    if (normalizedOwners.length === 0) {
      return [];
    }

    const accountMap = await this.getWorkspaceUserAccountMap(workspaceId);
    const resolved = normalizedOwners.map((owner) => {
      return accountMap.get(owner) || accountMap.get(owner.toLowerCase()) || owner;
    });

    const uniqueResolved = Array.from(new Set(resolved));
    this.logger.log(
      `[tapd-owner-map] workspaceId=${workspaceId} input=${JSON.stringify(normalizedOwners)} resolved=${JSON.stringify(uniqueResolved)}`,
    );
    return uniqueResolved;
  }

  private async getStoryStatusOptions(workspaceId: string): Promise<Record<string, string>> {
    if (this.storyStatusOptionsCache.has(workspaceId)) {
      return this.storyStatusOptionsCache.get(workspaceId) || {};
    }

    const fieldsInfo = await this.getStoryFieldsInfo(workspaceId);
    const normalizedOptions = this.extractTapdFieldOptions(fieldsInfo, ['status']);
    this.storyStatusOptionsCache.set(workspaceId, normalizedOptions);
    return normalizedOptions;
  }

  private normalizeStatusOptions(options: unknown) {
    const normalizedOptions: Record<string, string> = {};

    if (Array.isArray(options)) {
      options.forEach((item: unknown) => {
        if (item === null || item === undefined) {
          return;
        }
        if (typeof item === 'string') {
          const value = item.trim();
          if (!value) return;
          normalizedOptions[value] = value;
          normalizedOptions[value.toLowerCase()] = value;
          return;
        }
        if (typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const key = String(record.value ?? record.key ?? record.id ?? '').trim();
          const label = String(record.label ?? record.name ?? record.text ?? key).trim();
          if (!key || !label) return;
          normalizedOptions[key] = label;
          normalizedOptions[key.toLowerCase()] = label;
        }
      });
      return normalizedOptions;
    }

    if (typeof options === 'object' && options !== null) {
      Object.entries(options as Record<string, unknown>).forEach(([code, label]) => {
        const key = String(code || '').trim();
        const value = String(label || '').trim();
        if (!key || !value) return;
        normalizedOptions[key] = value;
        normalizedOptions[key.toLowerCase()] = value;
      });
    }

    return normalizedOptions;
  }

  private async getBugStatusOptions(workspaceId: string): Promise<Record<string, string>> {
    if (this.bugStatusOptionsCache.has(workspaceId)) {
      return this.bugStatusOptionsCache.get(workspaceId) || {};
    }

    let normalizedOptions: Record<string, string> = {};

    try {
      const fieldsInfo = await this.getBugFieldsInfo(workspaceId);
      normalizedOptions = this.extractTapdFieldOptions(fieldsInfo, ['status', 'bug_status', 'status_options']);
    } catch {
      this.logger.warn(`[tapd-bugs-status] failed to load status options, workspaceId=${workspaceId}`);
    }

    this.bugStatusOptionsCache.set(workspaceId, normalizedOptions);
    return normalizedOptions;
  }

  async getStoryStatusLabelMap(workspaceId: string): Promise<Record<string, string>> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }
    return this.getStoryStatusOptions(workspaceId);
  }

  async getBugStatusLabelMap(workspaceId: string): Promise<Record<string, string>> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }
    return this.getBugStatusOptions(workspaceId);
  }

  private async getDoneStoryStatuses(workspaceId: string): Promise<Set<string>> {
    if (this.doneStoryStatusesCache.has(workspaceId)) {
      return this.doneStoryStatusesCache.get(workspaceId) || new Set<string>();
    }

    const defaultDone = new Set<string>(['resolved', 'rejected', 'closed', 'done', 'completed', 'abandoned']);
    try {
      const statusOptions = await this.getStoryStatusOptions(workspaceId);
      const doneLabelPattern = /(已完成|已关闭|已拒绝|终止|关闭|完成|拒绝|已实现|已发布|已上线|done|closed|resolved|rejected)/i;
      const doneCodes = new Set<string>(defaultDone);
      Object.entries(statusOptions).forEach(([code, label]) => {
        if (doneLabelPattern.test(String(label))) {
          doneCodes.add(String(code).toLowerCase());
          doneCodes.add(String(label).toLowerCase());
        }
      });
      this.doneStoryStatusesCache.set(workspaceId, doneCodes);
      return doneCodes;
    } catch {
      console.warn('Failed to load TAPD story status options, fallback to default done statuses.');
      return defaultDone;
    }
  }

  private async getDoneBugStatuses(workspaceId: string): Promise<Set<string>> {
    if (this.doneBugStatusesCache.has(workspaceId)) {
      return this.doneBugStatusesCache.get(workspaceId) || new Set<string>();
    }

    const defaultDone = new Set<string>([
      'resolved',
      'rejected',
      'closed',
      'done',
      'completed',
      'abandoned',
      'verified',
      'fixed',
      'fixed_closed',
      'postponed',
    ]);

    try {
      const statusOptions = await this.getBugStatusOptions(workspaceId);
      const doneLabelPattern = /(已完成|已上线|已关闭|已拒绝|拒绝|关闭|完成|上线|终止|已发布|已实现|已解决|已修复|已验证|已确认|qa已确认|bugqa已确认|qa确认|已验收|验证通过|延期|postponed|done|closed|resolved|rejected|fixed|verified)/i;
      const doneCodes = new Set<string>(defaultDone);
      Object.entries(statusOptions).forEach(([code, label]) => {
        if (doneLabelPattern.test(String(label))) {
          doneCodes.add(String(code).toLowerCase());
          doneCodes.add(String(label).toLowerCase());
        }
      });
      this.doneBugStatusesCache.set(workspaceId, doneCodes);
      return doneCodes;
    } catch {
      this.logger.warn(`[tapd-bugs-status] failed to infer done statuses, workspaceId=${workspaceId}, use defaults`);
      return defaultDone;
    }
  }

  private async fetchPagedTapdData(endpoint: string, queryParams: Record<string, string>, wrapperKey: 'Story' | 'Bug'): Promise<any[]> {
    const allItems: any[] = [];
    let previousPageFingerprint = '';

    for (let page = 1; page <= this.maxPages; page += 1) {
      const response = await this.client.get(endpoint, {
        params: {
          ...queryParams,
          page: String(page),
          limit: String(this.pageSize),
        },
      });
      const rawData = response.data?.data || response.data || [];
      const pageItems = rawData
        .map((item: any) => item?.[wrapperKey] || item)
        .filter((item: any) => item && (item.id || item.story_id || item.bug_id));

      if (pageItems.length === 0) {
        break;
      }

      const fingerprint = pageItems
        .slice(0, 5)
        .map((item: any) => String(item.id || item.story_id || item.bug_id || ''))
        .join(',');
      if (page > 1 && fingerprint && fingerprint === previousPageFingerprint) {
        break;
      }
      previousPageFingerprint = fingerprint;

      allItems.push(...pageItems);

      if (pageItems.length < this.pageSize) {
        break;
      }
    }

    return Array.from(
      new Map(
        allItems.map((item: any) => [String(item.id || item.story_id || item.bug_id), item]),
      ).values(),
    );
  }

  private extractTapdItems(rawPayload: unknown, wrapperKey: 'Story' | 'Bug'): any[] {
    const rawData = rawPayload && typeof rawPayload === 'object' && 'data' in (rawPayload as Record<string, unknown>)
      ? (rawPayload as { data?: unknown }).data
      : rawPayload;
    const items = Array.isArray(rawData) ? rawData : [rawData];

    return items
      .map((item: any) => item?.[wrapperKey] || item)
      .filter((item: any) => item && (item.id || item.story_id || item.bug_id));
  }

  private async fetchTapdItemById(
    endpoint: string,
    wrapperKey: 'Story' | 'Bug',
    workspaceId: string,
    itemId: string,
    fields: string,
  ): Promise<Record<string, unknown> | null> {
    const response = await this.client.get(endpoint, {
      params: {
        workspace_id: workspaceId,
        id: itemId,
        fields,
      },
    });
    const items = this.extractTapdItems(response.data, wrapperKey);
    const matchedItem = items.find((item: any) => String(item.id || item.story_id || item.bug_id) === itemId);
    return (matchedItem || items[0] || null) as Record<string, unknown> | null;
  }

  private readCredentials() {
    const apiUser = process.env.TAPD_API_USER?.trim() || 'fxiaoke';
    const apiToken = process.env.TAPD_API_TOKEN?.trim() || '';

    if (!apiToken) {
      throw new UnauthorizedException('TAPD_API_TOKEN is missing. Please set TAPD_API_USER/TAPD_API_TOKEN in backend .env and restart backend.');
    }

    return { apiUser, apiToken };
  }

  setConfig(apiUrl: string, workspaceId?: string) {
    const { apiUser, apiToken } = this.readCredentials();
    this.config = { apiUrl, apiUser, workspaceId: workspaceId || "" };
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: "Basic " + Buffer.from(`${apiUser}:${apiToken}`).toString("base64"),
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  getConfig(): { apiUrl: string; apiUser: string; workspaceId: string } | null {
    return this.config;
  }

  async fetchProjects(workspaceId: string): Promise<TapdProject[]> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const response = await this.client.get(`/projects?workspace_id=${workspaceId}`);
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Bug": {...} }, ...]
      const data = rawData.map((item: any) => item.Bug || item);
      
      return data.map((item: any) => ({
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.project_id,
        name: item.name,
        description: item.description || '',
      }));
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  }

  async fetchIterations(workspaceId: string, projectId: string): Promise<TapdIteration[]> {
    void projectId;
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const response = await this.client.get(`/iterations?workspace_id=${workspaceId}`);
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Story": {...} }, ...]
      const data = rawData.map((item: any) => item.Story || item);
      
      return data.map((item: any) => ({
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.iteration_id,
        name: item.name,
        status: item.status,
        startDate: item.start_date,
        endDate: item.end_date,
      }));
    } catch (error) {
      console.error('Failed to fetch iterations:', error);
      return [];
    }
  }

  async fetchUsers(workspaceId: string, projectId: string): Promise<TapdUser[]> {
    void projectId;
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const response = await this.client.get('/workspaces/users', {
        params: {
          workspace_id: workspaceId,
          fields: 'user,user_id,name,email',
        },
      });
      const payload = response.data?.data ?? response.data ?? [];
      const rawList = Array.isArray(payload) ? payload : [];
      const data = rawList
        .map((item: any) => item?.UserWorkspace || item)
        .filter((item: any) => item && (item.user_id || item.user));

      return data.map((item: any) => ({
        id: String(item.user_id || item.user),
        name: item.name || item.user || '',
        email: item.email || '',
      }));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      return [];
    }
  }

  async fetchVersions(workspaceId: string, projectId: string): Promise<TapdVersion[]> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const response = await this.client.get(`/projects?workspace_id=${workspaceId}/${projectId}/releases`);
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Story": {...} }, ...]
      const data = rawData.map((item: any) => item.Story || item);
      
      return data.map((item: any) => ({
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.release_id,
        name: item.name,
        status: item.status,
      }));
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      return [];
    }
  }

  async fetchRequirements(params: FetchRequirementsParams): Promise<TapdRequirement[]> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const queryParams: Record<string, string> = {};
      
      if (params.projectId) { // disabled: workspace_id already in URL
        queryParams['project_id'] = params.projectId;
      }
      if (params.iterationId) {
        queryParams['iteration_id'] = params.iterationId;
      }
      const preferredOwners = (params.owners ?? []).map((item) => String(item || '').trim()).filter(Boolean);
      const fallbackOwnerIds = (params.ownerIds ?? []).map((item) => String(item || '').trim()).filter(Boolean);
      const ownerFilters = preferredOwners.length > 0 ? preferredOwners : fallbackOwnerIds;
      if (ownerFilters.length > 0) {
        const ownerAccounts = await this.resolveOwnerAccounts(params.workspaceId, ownerFilters);
        const ownerFilterValue = buildTapdUserFilter(ownerAccounts);
        if (ownerFilterValue) {
          // TAPD stories owner filter expects `owner`, not `owner_id`.
          queryParams['owner'] = ownerFilterValue;
        }
      }
      applyTapdStatusFilter(queryParams, params.status);

      this.logger.log(
        `[tapd-stories-query] workspaceId=${params.workspaceId} owner=${queryParams.owner ?? ''} source=${preferredOwners.length > 0 ? 'owners' : 'ownerIds'} params=${JSON.stringify(queryParams)}`,
      );
      const data = await this.fetchPagedTapdData(
        `/stories?workspace_id=${params.workspaceId}`,
        queryParams,
        'Story',
      );

      const doneStatuses = params.status ? new Set<string>() : await this.getDoneStoryStatuses(params.workspaceId);
      const doneLabelPattern = /(已完成|已上线|已关闭|已拒绝|关闭|完成|上线|终止|已发布|已实现|done|closed|resolved|rejected)/i;
      const filteredData = params.status
        ? data
        : data.filter((item: any) => {
            const rawStatus = String(item.status || '');
            const status = rawStatus.toLowerCase();
            if (!status) return false;
            if (doneStatuses.has(status)) return false;
            if (doneLabelPattern.test(rawStatus)) return false;
            return true;
          });

      return filteredData.map((item: any) => {
        const ownerNames = extractTapdOwnerNames(item as Record<string, unknown>);

        return {
          iterationId: item.iteration_id || item.iterationId,
          id: item.id || item.story_id,
          name: item.name || item.title,
          description: item.description || '',
          status: item.status,
          owner: ownerNames.join(' ') || item.owner?.name || item.owner_name || '',
          ownerNames,
          created: item.created,
          modified: item.modified,
          url: item.url || `https://www.tapd.cn/tapd_fe/${params.workspaceId}/story/detail/${item.id}`,
        };
      });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        throw new UnauthorizedException('TAPD authentication failed (401). Please verify TAPD_API_USER/TAPD_API_TOKEN in backend .env.');
      }
      console.error('Failed to fetch requirements:', error);
      return [];
    }
  }

  async fetchStoryDetail(workspaceId: string, storyId: string): Promise<TapdDetailPayload | null> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const item = await this.fetchTapdItemById(
        '/stories',
        'Story',
        workspaceId,
        storyId,
        'id,story_id,name,title,description,status,owner,owner_name,owner_names,created,modified,url,iteration,iteration_id,iteration_name,current_iteration,current_iteration_name,release,release_id,release_name,version,version_id,version_name,priority,priority_name,severity,severity_name,story_type,story_type_name',
      );

      if (!item) {
        return null;
      }

      const rawStatus = String(item.status || '').trim();
      const statusLabelMap = await this.getStoryStatusOptions(workspaceId);
      const storyFieldsInfo = await this.getStoryFieldsInfo(workspaceId);
      const ownerNames = extractTapdOwnerNames(item);
      const iterationOptions = this.extractTapdFieldOptions(storyFieldsInfo, ['iteration_id']);
      const versionOptions = this.extractTapdFieldOptions(storyFieldsInfo, ['version', 'version_id', 'release_id']);
      const priorityOptions = this.extractTapdFieldOptions(storyFieldsInfo, ['priority_label', 'priority']);
      const severityOptions = this.extractTapdFieldOptions(storyFieldsInfo, ['severity']);
      const iterationName = pickFirstTapdText(item, [
        'iteration_name',
        'current_iteration_name',
      ]) || this.resolveTapdOptionLabel(item.iteration ?? item.current_iteration ?? item.iteration_id, iterationOptions);
      const version = pickFirstTapdText(item, [
        'version_name',
        'release_name',
      ]) || this.resolveTapdOptionLabel(item.version ?? item.version_id ?? item.release ?? item.release_id, versionOptions);
      const priority = pickFirstTapdText(item, [
        'priority_label',
        'priority_name',
      ]) || this.resolveTapdOptionLabel(item.priority, priorityOptions);
      const severity = pickFirstTapdText(item, [
        'severity_name',
      ]) || this.resolveTapdOptionLabel(item.severity, severityOptions);

      return {
        kind: 'story',
        workspaceId,
        id: String(item.id || item.story_id || storyId),
        title: String(item.name || item.title || ''),
        description: String(item.description || ''),
        status: statusLabelMap[rawStatus] || statusLabelMap[rawStatus.toLowerCase()] || rawStatus,
        owner: ownerNames.join(' ') || String(item.owner_name || ''),
        ownerNames,
        created: String(item.created || ''),
        modified: String(item.modified || ''),
        url: String(item.url || `https://www.tapd.cn/tapd_fe/${workspaceId}/story/detail/${storyId}`),
        iterationName,
        version,
        priority,
        severity,
      };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        throw new UnauthorizedException('TAPD authentication failed (401). Please verify TAPD_API_USER/TAPD_API_TOKEN in backend .env.');
      }
      console.error('Failed to fetch TAPD story detail:', error);
      return null;
    }
  }

  async fetchBugs(params: FetchBugsParams): Promise<TapdBug[]> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const queryParams: Record<string, string> = {};
      
      if (params.projectId) { // disabled: workspace_id already in URL
        queryParams['project_id'] = params.projectId;
      }
      if (params.iterationId) {
        queryParams['iteration_id'] = params.iterationId;
      }
      if (params.title) {
        queryParams['title'] = params.title;
      }
      if (params.versionId) {
        queryParams['version_id'] = params.versionId;
      }
      const preferredOwners = (params.owners ?? []).map((item) => String(item || '').trim()).filter(Boolean);
      const fallbackOwnerIds = (params.ownerIds ?? []).map((item) => String(item || '').trim()).filter(Boolean);
      const ownerFilters = preferredOwners.length > 0 ? preferredOwners : fallbackOwnerIds;
      if (ownerFilters.length > 0) {
        const ownerAccounts = await this.resolveOwnerAccounts(params.workspaceId, ownerFilters);
        const ownerFilterValue = buildTapdUserFilter(ownerAccounts);
        if (ownerFilterValue) {
          // TAPD bugs owner filter expects `current_owner`.
          queryParams['current_owner'] = ownerFilterValue;
        }
      }
      applyTapdStatusFilter(queryParams, params.status);

      this.logger.log(
        `[tapd-bugs-query] workspaceId=${params.workspaceId} current_owner=${queryParams.current_owner ?? ''} source=${preferredOwners.length > 0 ? 'owners' : 'ownerIds'} params=${JSON.stringify(queryParams)}`,
      );
      const data = await this.fetchPagedTapdData(
        `/bugs?workspace_id=${params.workspaceId}`,
        queryParams,
        'Bug',
      );
      const bugStatusLabelMap = await this.getBugStatusOptions(params.workspaceId);
      const doneStatuses = await this.getDoneBugStatuses(params.workspaceId);
      const doneLabelPattern = /(已完成|已上线|已关闭|已拒绝|拒绝|关闭|完成|上线|终止|已发布|已实现|已解决|已修复|已验证|已确认|qa已确认|bugqa已确认|qa确认|已验收|验证通过|延期|postponed|done|closed|resolved|rejected|fixed|verified)/i;

      const allStatusEntries = Array.from(
        new Set<string>(
          data
            .map((item: any) => String(item.status || '').trim())
            .filter(Boolean),
        ),
      ).map((status: string) => ({
        raw: status,
        label: bugStatusLabelMap[status] || bugStatusLabelMap[status.toLowerCase()] || status,
      }));

      const filteredData = params.status
        ? data
        : data.filter((item: any) => {
            const rawStatus = String(item.status || '');
            const status = rawStatus.toLowerCase();
            const mappedLabel = String(
              bugStatusLabelMap[rawStatus] || bugStatusLabelMap[status] || rawStatus,
            );
            if (!status) return false;
            if (doneStatuses.has(status)) return false;
            if (doneStatuses.has(mappedLabel.toLowerCase())) return false;
            if (doneLabelPattern.test(rawStatus)) return false;
            if (doneLabelPattern.test(mappedLabel)) return false;
            return true;
          });

      if (!params.status) {
        const openStatusEntries = Array.from(
          new Set<string>(
            filteredData
              .map((item: any) => String(item.status || '').trim())
              .filter(Boolean),
          ),
        ).map((status: string) => ({
          raw: status,
          label: bugStatusLabelMap[status] || bugStatusLabelMap[status.toLowerCase()] || status,
        }));
        this.logger.log(
          `[tapd-bugs-status-summary] workspaceId=${params.workspaceId} all=${JSON.stringify(allStatusEntries)} suspected_open=${JSON.stringify(openStatusEntries)}`,
        );
      }

      return filteredData.map((item: any) => {
        const bugDetailId = item.bug_id || item.id;
        const rawStatus = String(item.status || '');
        const statusLabel = bugStatusLabelMap[rawStatus] || bugStatusLabelMap[rawStatus.toLowerCase()] || rawStatus;
        const ownerNames = extractTapdOwnerNames(item as Record<string, unknown>);
        return {
          iterationId: item.iteration_id || item.iterationId,
          id: item.id || item.bug_id,
          title: item.title,
          description: item.description || '',
          status: statusLabel,
          owner: ownerNames.join(' ') || item.owner?.name || item.owner_name || '',
          ownerNames,
          created: item.created,
          modified: item.modified,
          url: item.url || `https://www.tapd.cn/tapd_fe/${params.workspaceId}/bug/detail/${bugDetailId}`,
          version: item.version || '',
        };
      });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        throw new UnauthorizedException('TAPD authentication failed (401). Please verify TAPD_API_USER/TAPD_API_TOKEN in backend .env.');
      }
      console.error('Failed to fetch bugs:', error);
      return [];
    }
  }

  async fetchBugDetail(workspaceId: string, bugId: string): Promise<TapdDetailPayload | null> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const item = await this.fetchTapdItemById(
        '/bugs',
        'Bug',
        workspaceId,
        bugId,
        'id,bug_id,title,description,status,current_owner,current_owner_name,current_owner_names,created,modified,url,iteration,iteration_id,iteration_name,current_iteration,current_iteration_name,version,version_id,version_name,release,release_id,release_name,priority,priority_name,severity,severity_name',
      );

      if (!item) {
        return null;
      }

      const rawStatus = String(item.status || '').trim();
      const bugStatusLabelMap = await this.getBugStatusOptions(workspaceId);
      const bugFieldsInfo = await this.getBugFieldsInfo(workspaceId);
      const ownerNames = extractTapdOwnerNames(item);
      const resolvedBugId = String(item.bug_id || item.id || bugId);
      const iterationOptions = this.extractTapdFieldOptions(bugFieldsInfo, ['iteration_id']);
      const versionOptions = this.extractTapdFieldOptions(bugFieldsInfo, ['version', 'version_id', 'release_id']);
      const priorityOptions = this.extractTapdFieldOptions(bugFieldsInfo, ['priority_label', 'priority']);
      const severityOptions = this.extractTapdFieldOptions(bugFieldsInfo, ['severity']);
      const iterationName = pickFirstTapdText(item, [
        'iteration_name',
        'current_iteration_name',
      ]) || this.resolveTapdOptionLabel(item.iteration ?? item.current_iteration ?? item.iteration_id, iterationOptions);
      const version = pickFirstTapdText(item, [
        'version_name',
        'release_name',
      ]) || this.resolveTapdOptionLabel(item.version ?? item.version_id ?? item.release ?? item.release_id, versionOptions);
      const priority = pickFirstTapdText(item, [
        'priority_label',
        'priority_name',
      ]) || this.resolveTapdOptionLabel(item.priority, priorityOptions);
      const severity = pickFirstTapdText(item, [
        'severity_name',
      ]) || this.resolveTapdOptionLabel(item.severity, severityOptions);

      return {
        kind: 'bug',
        workspaceId,
        id: String(item.id || item.bug_id || bugId),
        title: String(item.title || ''),
        description: String(item.description || ''),
        status: bugStatusLabelMap[rawStatus] || bugStatusLabelMap[rawStatus.toLowerCase()] || rawStatus,
        owner: ownerNames.join(' ') || String(item.current_owner_name || ''),
        ownerNames,
        created: String(item.created || ''),
        modified: String(item.modified || ''),
        url: String(item.url || `https://www.tapd.cn/tapd_fe/${workspaceId}/bug/detail/${resolvedBugId}`),
        iterationName,
        version,
        priority,
        severity,
      };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        throw new UnauthorizedException('TAPD authentication failed (401). Please verify TAPD_API_USER/TAPD_API_TOKEN in backend .env.');
      }
      console.error('Failed to fetch TAPD bug detail:', error);
      return null;
    }
  }

  async fetchTodos(workspaceId: string, userId: string): Promise<TapdRequirement[]> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const [ownerAccount] = await this.resolveOwnerAccounts(workspaceId, [userId]);
      const ownerValue = ownerAccount || userId;
      this.logger.log(
        `[tapd-todos-query] workspaceId=${workspaceId} owner=${ownerValue} userIdInput=${userId}`,
      );
      const response = await this.client.get(`/stories?workspace_id=${workspaceId}`, {
        params: {
          owner: ownerValue,
          status: 'open,in_progress',
        },
      });
      
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Story": {...} }, ...]
      const data = rawData.map((item: any) => item.Story || item);
      
      return data.map((item: any) => {
        const ownerNames = extractTapdOwnerNames(item as Record<string, unknown>);
        return {
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.story_id,
        name: item.name || item.title,
        description: item.description || '',
        status: item.status,
        owner: ownerNames.join(' ') || item.owner?.name || item.owner_name || '',
        ownerNames,
        created: item.created,
        modified: item.modified,
        url: item.url || `https://www.tapd.cn/tapd_fe/${workspaceId}/story/detail/${item.id}`,
        };
      });
    } catch (error) {
      console.error('Failed to fetch todos:', error);
      return [];
    }
  }
}
