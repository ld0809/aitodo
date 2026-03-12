import { Injectable } from '@nestjs/common';
import { Card } from '../database/entities/card.entity';
import { PluginRegistry } from './plugin-registry.service';

@Injectable()
export class PluginExecutor {
  constructor(private readonly pluginRegistry: PluginRegistry) {}

  async fetchCardTodos(userId: string, card: Card) {
    try {
      const plugin = this.pluginRegistry.get(card.pluginType);
      const parsedConfig = this.parseConfig(card.pluginConfigJson);

      console.log('[PluginExecutor] cardId:', card.id, 'pluginType:', card.pluginType, 'config:', parsedConfig);

      await plugin.validateConfig(parsedConfig);
      const items = await plugin.fetchItems({
        userId,
        cardId: card.id,
        card,
        config: parsedConfig,
      });

      const sortedItems = plugin.sortItems(items, card.sortBy, card.sortOrder);
      const maxItems = card.pluginType === 'tapd' ? 200 : 20;
      return plugin.mapToCardView(sortedItems).slice(0, maxItems);
    } catch (error) {
      console.error('[PluginExecutor] Error fetching card todos:', error);
      throw error;
    }
  }

  private parseConfig(configJson: string | null) {
    if (!configJson) {
      return {};
    }
    return JSON.parse(configJson) as unknown;
  }
}
