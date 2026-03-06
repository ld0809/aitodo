/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

export interface TapdRequirement {
  iterationId?: string;
  id: string;
  name: string;
  description: string;
  status: string;
  owner: string;
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
  created: string;
  modified: string;
  url: string;
  version: string;
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
  ownerIds?: string[];
  status?: string;
}

export interface FetchBugsParams {
  workspaceId: string;
  projectId?: string;
  iterationId?: string;
  title?: string;
  versionId?: string;
  ownerIds?: string[];
  status?: string;
}

@Injectable()
export class TapdService {
  private client: any = null;
  private config: { apiUrl: string; apiUser: string; workspaceId: string } | null = null;
  private doneStoryStatusesCache = new Map<string, Set<string>>();

  private async getDoneStoryStatuses(workspaceId: string): Promise<Set<string>> {
    if (this.doneStoryStatusesCache.has(workspaceId)) {
      return this.doneStoryStatusesCache.get(workspaceId) || new Set<string>();
    }

    const defaultDone = new Set<string>(['resolved', 'rejected', 'closed', 'done', 'completed', 'abandoned']);
    try {
      const response = await this.client.get(`/stories/get_fields_info?workspace_id=${workspaceId}`);
      const statusOptions = response.data?.data?.status?.options || {};
      const doneLabelPattern = /(已完成|已关闭|已拒绝|终止|关闭|完成|拒绝|已实现|已发布|已上线|done|closed|resolved|rejected)/i;
      const doneCodes = new Set<string>(defaultDone);
      Object.entries(statusOptions).forEach(([code, label]) => {
        if (doneLabelPattern.test(String(label))) {
          doneCodes.add(code);
        }
      });
      this.doneStoryStatusesCache.set(workspaceId, doneCodes);
      return doneCodes;
    } catch (error) {
      console.warn('Failed to load TAPD story status options, fallback to default done statuses.');
      return defaultDone;
    }
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
      if (params.ownerIds && params.ownerIds.length > 0) {
        queryParams['owner_id'] = params.ownerIds.join(',');
      }
      if (params.status) {
        queryParams['status'] = params.status;
      }

      const response = await this.client.get(`/stories?workspace_id=${params.workspaceId}`, { params: queryParams });
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Story": {...} }, ...]
      const data = rawData.map((item: any) => item.Story || item);

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

      return filteredData.map((item: any) => ({
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.story_id,
        name: item.name || item.title,
        description: item.description || '',
        status: item.status,
        owner: item.owner?.name || item.owner_name || '',
        created: item.created,
        modified: item.modified,
        url: item.url || `https://www.tapd.cn/tapd_fe/${this.config?.workspaceId}/story/detail/${item.id}`,
      }));
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        throw new UnauthorizedException('TAPD authentication failed (401). Please verify TAPD_API_USER/TAPD_API_TOKEN in backend .env.');
      }
      console.error('Failed to fetch requirements:', error);
      return [];
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
      if (params.ownerIds && params.ownerIds.length > 0) {
        queryParams['owner_id'] = params.ownerIds.join(',');
      }
      if (params.status) {
        queryParams['status'] = params.status;
      }

      const response = await this.client.get(`/bugs?workspace_id=${params.workspaceId}`, { params: queryParams });
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Bug": {...} }, ...]
      const data = rawData.map((item: any) => item.Bug || item);
      
      return data.map((item: any) => ({
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.bug_id,
        title: item.title,
        description: item.description || '',
        status: item.status,
        owner: item.owner?.name || item.owner_name || '',
        created: item.created,
        modified: item.modified,
        url: item.url || `https://www.tapd.cn/tapd_fe/${this.config?.workspaceId}/bug/detail/${item.id || item.bug_id}`,
        version: item.version || '',
      }));
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        throw new UnauthorizedException('TAPD authentication failed (401). Please verify TAPD_API_USER/TAPD_API_TOKEN in backend .env.');
      }
      console.error('Failed to fetch bugs:', error);
      return [];
    }
  }

  async fetchTodos(workspaceId: string, userId: string): Promise<TapdRequirement[]> {
    if (!this.client) {
      throw new Error('TAPD client not initialized. Please set config first.');
    }

    try {
      const response = await this.client.get(`/stories?workspace_id=${workspaceId}`, {
        params: {
          owner_id: userId,
          status: 'open,in_progress',
        },
      });
      
      const rawData = response.data?.data || response.data || [];
      // TAPD 返回格式: [{ "Story": {...} }, ...]
      const data = rawData.map((item: any) => item.Story || item);
      
      return data.map((item: any) => ({
        iterationId: item.iteration_id || item.iterationId,
        id: item.id || item.story_id,
        name: item.name || item.title,
        description: item.description || '',
        status: item.status,
        owner: item.owner?.name || item.owner_name || '',
        created: item.created,
        modified: item.modified,
        url: item.url || `https://www.tapd.cn/tapd_fe/${this.config?.workspaceId}/story/detail/${item.id}`,
      }));
    } catch (error) {
      console.error('Failed to fetch todos:', error);
      return [];
    }
  }
}
