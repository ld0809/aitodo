import { Card } from '../../database/entities/card.entity';
import { CardTodoView, PluginItem } from '../types/plugin-item.type';

export interface PluginFetchContext {
  userId: string;
  cardId: string;
  card: Card;
  config: unknown;
}

export interface DataSourcePlugin {
  type: string;
  validateConfig(config: unknown): Promise<void>;
  fetchItems(ctx: PluginFetchContext): Promise<PluginItem[]>;
  sortItems(items: PluginItem[], sortBy: string, sortOrder: 'asc' | 'desc'): PluginItem[];
  mapToCardView(items: PluginItem[]): CardTodoView[];
}
