import type { User } from '../types';
import apiClient from './client';

export interface UpdateMeDto {
  nickname?: string;
  avatarUrl?: string;
  target?: string;
}

export const usersApi = {
  getMe: () => apiClient.get<User>('/users/me'),
  updateMe: (data: UpdateMeDto) => apiClient.patch<User>('/users/me', data),
};
