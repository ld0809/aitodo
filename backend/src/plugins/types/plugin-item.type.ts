export interface PluginTagView {
  id: string;
  name: string;
  color: string | null;
}

export interface PluginItem {
  id: string;
  content: string;
  handlerNames?: string[];
  creatorUserId?: string;
  creatorName?: string;
  creatorRole?: 'owner' | 'participant';
  dueAt: Date | null;
  executeAt: Date | null;
  status: 'todo' | 'done' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  tags: PluginTagView[];
  url?: string;
}

export interface CardTodoView {
  id: string;
  content: string;
  handlerNames?: string[];
  creatorUserId?: string;
  creatorName?: string;
  creatorRole?: 'owner' | 'participant';
  dueAt: Date | null;
  executeAt: Date | null;
  status: 'todo' | 'done' | 'completed';
  tags: PluginTagView[];
  url?: string;
}
