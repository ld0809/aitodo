import type { Todo, TodoProgressEntry } from '../types';
import apiClient from './client';

export interface CreateTodoDto {
  content: string;
  dueAt?: string;
  executeAt?: string;
  tagIds?: string[];
  cardId?: string;
}

export interface UpdateTodoDto {
  content?: string;
  dueAt?: string;
  executeAt?: string;
  status?: 'todo' | 'done' | 'completed';
  tagIds?: string[];
}

export interface CreateTodoProgressDto {
  content: string;
}

export const todosApi = {
  getAll: () => apiClient.get<Todo[]>('/todos'),

  getById: (id: string) => apiClient.get<Todo>(`/todos/${id}`),

  create: (data: CreateTodoDto) => apiClient.post<Todo>('/todos', data),

  update: (id: string, data: UpdateTodoDto) =>
    apiClient.patch<Todo>(`/todos/${id}`, data),

  delete: (id: string) => apiClient.delete(`/todos/${id}`),

  toggleStatus: (id: string, completed: boolean = true) =>
    apiClient.patch<Todo>(`/todos/${id}/complete`, { completed }),

  getProgress: (id: string) => apiClient.get<TodoProgressEntry[]>(`/todos/${id}/progress`),

  createProgress: (id: string, data: CreateTodoProgressDto) =>
    apiClient.post<TodoProgressEntry & { progressCount: number }>(`/todos/${id}/progress`, data),
};
