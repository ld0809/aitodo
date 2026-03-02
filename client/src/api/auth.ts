import type { AuthResponse } from '../types';
import apiClient from './client';

// NestJS wraps responses in { code, message, data }
export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post<{ code: number; message: string; data: AuthResponse }>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    apiClient.post<{ code: number; message: string; data: AuthResponse }>('/auth/login', { email, password }),

  sendEmailCode: (email: string) =>
    apiClient.post('/auth/send-email-code', { email }),

  verifyEmail: (email: string, code: string) =>
    apiClient.post('/auth/verify-email', { email, code }),
};
