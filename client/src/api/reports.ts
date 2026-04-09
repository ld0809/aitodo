import apiClient from './client';

export interface GenerateAiReportDto {
  startAt?: string;
  endAt?: string;
}

export interface AiReportResult {
  provider: 'iflow' | 'openai';
  period: {
    startAt: string;
    endAt: string;
    defaultedToLastWeek: boolean;
  };
  todoCount: number;
  progressCount: number;
  report: string;
}

export const reportsApi = {
  generateAiReport: (data: GenerateAiReportDto) =>
    apiClient.post<AiReportResult>('/reports/ai', data),
};
