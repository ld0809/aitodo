import type { Tag } from '../types';
import apiClient from './client';

export interface CreateTagDto {
  name: string;
  color?: string;
}

export interface UpdateTagDto {
  name?: string;
  color?: string;
}

export const tagsApi = {
  getAll: () => apiClient.get<Tag[]>('/tags'),

  getById: (id: string) => apiClient.get<Tag>(`/tags/${id}`),

  create: (data: CreateTagDto) => apiClient.post<Tag>('/tags', data),

  update: (id: string, data: UpdateTagDto) =>
    apiClient.patch<Tag>(`/tags/${id}`, data),

  delete: (id: string) => apiClient.delete(`/tags/${id}`),
};
