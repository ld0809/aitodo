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

export interface OpenClawBinding {
  bound: boolean;
  connected: boolean;
  enabled: boolean;
  connectToken: string | null;
  deviceLabel: string | null;
  connectionStatus: 'pending' | 'connected' | 'disconnected' | 'revoked' | null;
  timeoutSeconds: number | null;
  lastSeenAt: string | null;
  lastDispatchedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  channelCode: string;
  wsUrl: string | null;
  docsUrl: string;
  pluginPackageName: string;
  pluginInstallCommand: string | null;
  pluginEnableCommand: string | null;
  pluginConfigSnippet: string | null;
  pairingHint: string;
  routingHint: string;
  sessionStrategy: 'per_todo';
  suggestedDeviceLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  handlerNames?: string[];
  creatorUserId?: string;
  creatorName?: string;
  creatorRole?: 'owner' | 'participant';
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
  owner?: CardParticipant;
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
