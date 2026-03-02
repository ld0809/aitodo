import type { Todo } from '../types';
import apiClient from './client';

export interface CreateTodoDto {
  content: string;
  dueAt?: string;
  executeAt?: string;
  tagIds?: string[];
}

export interface UpdateTodoDto {
  content?: string;
  dueAt?: string;
  executeAt?: string;
  status?: 'todo' | 'done' | 'completed';
  tagIds?: string[];
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
};
