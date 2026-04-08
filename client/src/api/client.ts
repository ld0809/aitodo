import axios from 'axios';
import { queryClient } from '../lib/queryClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors and unwrap API responses
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap API response: {code: 0, message: "ok", data: ...} -> data
    if (response.data && response.data.data !== undefined) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    const requestUrl = error.config?.url as string | undefined;
    const isAuthLoginRequest = typeof requestUrl === 'string' && requestUrl.includes('/auth/login');
    const hasAccessToken = Boolean(localStorage.getItem('accessToken'));

    if (error.response?.status === 401 && hasAccessToken && !isAuthLoginRequest) {
      queryClient.clear();
      localStorage.removeItem('accessToken');
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
