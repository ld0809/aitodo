import type { OpenClawBinding } from '../types';
import apiClient from './client';

export interface UpdateOpenClawBindingDto {
  deviceLabel?: string;
  enabled?: boolean;
  timeoutSeconds?: number;
  rotateToken?: boolean;
}

export const openClawApi = {
  getMe: () => apiClient.get<OpenClawBinding>('/openclaw/me'),
  provisionMe: () => apiClient.post<OpenClawBinding>('/openclaw/me/provision'),
  updateMe: (data: UpdateOpenClawBindingDto) => apiClient.patch<OpenClawBinding>('/openclaw/me', data),
  deleteMe: () => apiClient.delete<OpenClawBinding>('/openclaw/me'),
};
