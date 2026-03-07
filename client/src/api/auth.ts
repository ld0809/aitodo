import type { AuthResponse, User } from '../types';
import apiClient from './client';

export interface RegisterResponse extends User {
  debugVerificationCode?: string;
}

export interface SendEmailCodeResponse {
  email: string;
  expiresAt: string;
  debugCode?: string;
}

export interface VerifyEmailResponse {
  verified: boolean;
}

export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post<RegisterResponse>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }),

  sendEmailCode: (email: string) =>
    apiClient.post<SendEmailCodeResponse>('/auth/send-email-code', { email }),

  verifyEmail: (email: string, code: string) =>
    apiClient.post<VerifyEmailResponse>('/auth/verify-email', { email, code }),
};
