import type { Card, LayoutViewport } from '../types';
import apiClient from './client';

export interface CreateCardDto {
  name: string;
  cardType?: 'personal' | 'shared';
  sortBy?: 'due_at' | 'created_at' | 'execute_at';
  sortOrder?: 'asc' | 'desc';
  tagIds?: string[];
  participantEmails?: string[];
  pluginType?: 'local_todo' | 'tapd';
  pluginConfig?: Record<string, unknown>;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface UpdateCardDto {
  name?: string;
  cardType?: 'personal' | 'shared';
  sortBy?: 'due_at' | 'created_at' | 'execute_at';
  sortOrder?: 'asc' | 'desc';
  tagIds?: string[];
  participantEmails?: string[];
  pluginType?: 'local_todo' | 'tapd';
  pluginConfig?: Record<string, unknown>;
}

export interface UpdateLayoutDto {
  x: number;
  y: number;
  w?: number;
  h?: number;
  viewport?: LayoutViewport;
}

export const cardsApi = {
  getAll: (viewport: LayoutViewport, status?: 'active' | 'archived') => {
    const searchParams = new URLSearchParams({ viewport });
    if (status) {
      searchParams.set('status', status);
    }
    return apiClient.get<Card[]>(`/cards?${searchParams.toString()}`);
  },

  getById: (id: string, viewport: LayoutViewport) => apiClient.get<Card>(`/cards/${id}?viewport=${viewport}`),

  create: (data: CreateCardDto) => apiClient.post<Card>('/cards', data),

  update: (id: string, data: UpdateCardDto) =>
    apiClient.patch<Card>(`/cards/${id}`, data),

  archive: (id: string) => apiClient.patch<Card>(`/cards/${id}/archive`),

  delete: (id: string) => apiClient.delete(`/cards/${id}`),

  getTodos: (id: string) => apiClient.get(`/cards/${id}/todos`),

  updateLayout: (id: string, data: UpdateLayoutDto) =>
    apiClient.patch<Card>(`/cards/${id}/layout`, data),
};
