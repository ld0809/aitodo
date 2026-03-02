export interface PluginTagView {
  id: string;
  name: string;
  color: string | null;
}

export interface PluginItem {
  id: string;
  content: string;
  dueAt: Date | null;
  executeAt: Date | null;
  status: 'todo' | 'done' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  tags: PluginTagView[];
}

export interface CardTodoView {
  id: string;
  content: string;
  dueAt: Date | null;
  executeAt: Date | null;
  status: 'todo' | 'done' | 'completed';
  tags: PluginTagView[];
}
