export interface User {
  id: string;
  email: string;
  nickname?: string;
  avatarUrl?: string;
  target?: string;
  emailVerified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CardParticipant {
  id: string;
  email: string;
  nickname?: string;
  mentionKey: string;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: string;
  userId: string;
  cardId?: string | null;
  content: string;
  dueAt?: string;
  executeAt?: string;
  status: 'todo' | 'done' | 'completed';
  completedAt?: string;
  progressCount?: number;
  url?: string;
  tags: Tag[];
  assignees?: CardParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoProgressEntry {
  id: string;
  todoId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface Card {
  id: string;
  userId: string;
  name: string;
  cardType: 'personal' | 'shared';
  sortBy: 'due_at' | 'created_at' | 'execute_at';
  sortOrder: 'asc' | 'desc';
  x: number;
  y: number;
  w: number;
  h: number;
  pluginType: string;
  pluginConfigJson?: string;
  tags: Tag[];
  participants?: CardParticipant[];
  todos?: Todo[];
  createdAt: string;
  updatedAt: string;
  url?: string;
}

export type LayoutViewport = 'mobile' | 'tablet' | 'desktop_normal' | 'desktop_big';

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface ApiError {
  message: string;
  statusCode: number;
}
