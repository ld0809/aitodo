import { apiClient } from './client';
import { useTapdStore } from '../store/tapdStore';

// TAPD API 类型定义
export interface TapdProject {
  id: string;
  name: string;
  code: string;
}

export interface TapdIteration {
  id: string;
  name: string;
  project_id: string;
}

export interface TapdUser {
  id: string;
  name: string;
  nickname?: string;
}

export interface TapdRequirement {
  id: string;
  story_id?: string;
  name: string;
  status: string;
  owner?: string;
  iteration_id?: string;
  iteration_name?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface TapdBug {
  id: string;
  bug_id?: string;
  title: string;
  status: string;
  severity?: string;
  priority?: string;
  assignee?: string;
  version?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface TapdTodo {
  id: string;
  content: string;
  status: string;
  owner?: string;
  due_date?: string;
  [key: string]: unknown;
}

// 获取项目列表
export const getProjects = async (): Promise<TapdProject[]> => {
  const { apiBaseUrl } = useTapdStore.getState();
  const response = await apiClient.get(apiBaseUrl + '/api/projects');
  return response.data;
};

// 获取迭代列表
export const getIterations = async (projectId: string): Promise<TapdIteration[]> => {
  const { apiBaseUrl } = useTapdStore.getState();
  const response = await apiClient.get(apiBaseUrl + '/api/projects/' + projectId + '/iterations');
  return response.data;
};

// 获取用户列表
export const getUsers = async (projectId: string): Promise<TapdUser[]> => {
  const { apiBaseUrl } = useTapdStore.getState();
  const response = await apiClient.get(apiBaseUrl + '/api/projects/' + projectId + '/users?workspaceId=' + projectId);
  return response.data;
};

// 获取需求列表
export const getRequirements = async (params: {
  projectId: string;
  iterationId?: string;
  ownerIds?: string[];
  statuses?: string[];
}): Promise<TapdRequirement[]> => {
  const { apiBaseUrl } = useTapdStore.getState();
  const queryParams = new URLSearchParams();
  queryParams.append('projectId', params.projectId);
  if (params.iterationId) queryParams.append('iterationId', params.iterationId);
  if (params.ownerIds && params.ownerIds.length) queryParams.append('ownerIds', params.ownerIds.join(','));
  if (params.statuses && params.statuses.length) queryParams.append('status', params.statuses.join(','));
  
  const response = await apiClient.get(apiBaseUrl + '/api/requirements?' + queryParams.toString());
  return response.data;
};

// 获取缺陷列表
export const getBugs = async (params: {
  projectId: string;
  iterationId?: string;
  versionId?: string;
  version?: string;
  title?: string;
  ownerIds?: string[];
  statuses?: string[];
}): Promise<TapdBug[]> => {
  const { apiBaseUrl } = useTapdStore.getState();
  const queryParams = new URLSearchParams();
  queryParams.append('projectId', params.projectId);
  if (params.iterationId) queryParams.append('iterationId', params.iterationId);
  if (params.versionId) queryParams.append('versionId', params.versionId);
  if (params.version) queryParams.append('versionId', params.version);
  if (params.title) queryParams.append('title', params.title);
  if (params.ownerIds && params.ownerIds.length) queryParams.append('ownerIds', params.ownerIds.join(','));
  if (params.statuses && params.statuses.length) queryParams.append('status', params.statuses.join(','));
  
  const response = await apiClient.get(apiBaseUrl + '/api/bugs?' + queryParams.toString());
  return response.data;
};

// 获取待办列表
export const getTodos = async (ownerId: string): Promise<TapdTodo[]> => {
  const { apiBaseUrl } = useTapdStore.getState();
  const response = await apiClient.get(apiBaseUrl + '/api/todos/' + ownerId + '/todos');
  return response.data;
};
