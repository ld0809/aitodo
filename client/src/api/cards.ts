import type { Card } from '../types';
import apiClient from './client';

export interface CreateCardDto {
  name: string;
  sortBy?: 'due_at' | 'created_at' | 'execute_at';
  sortOrder?: 'asc' | 'desc';
  tagIds?: string[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface UpdateCardDto {
  name?: string;
  sortBy?: 'due_at' | 'created_at' | 'execute_at';
  sortOrder?: 'asc' | 'desc';
  tagIds?: string[];
}

export interface UpdateLayoutDto {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export const cardsApi = {
  getAll: () => apiClient.get<Card[]>('/cards'),

  getById: (id: string) => apiClient.get<Card>(`/cards/${id}`),

  create: (data: CreateCardDto) => apiClient.post<Card>('/cards', data),

  update: (id: string, data: UpdateCardDto) =>
    apiClient.patch<Card>(`/cards/${id}`, data),

  delete: (id: string) => apiClient.delete(`/cards/${id}`),

  getTodos: (id: string) => apiClient.get(`/cards/${id}/todos`),

  updateLayout: (id: string, data: UpdateLayoutDto) =>
    apiClient.patch<Card>(`/cards/${id}/layout`, data),
};
