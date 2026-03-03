export interface User {
  id: string;
  email: string;
  nickname?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
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
  content: string;
  dueAt?: string;
  executeAt?: string;
  status: 'todo' | 'done' | 'completed';
  completedAt?: string;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  userId: string;
  name: string;
  sortBy: 'due_at' | 'created_at' | 'execute_at';
  sortOrder: 'asc' | 'desc';
  x: number;
  y: number;
  w: number;
  h: number;
  pluginType: string;
  pluginConfigJson?: string;
  tags: Tag[];
  todos?: Todo[];
  createdAt: string;
  updatedAt: string;
  url?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface ApiError {
  message: string;
  statusCode: number;
}
