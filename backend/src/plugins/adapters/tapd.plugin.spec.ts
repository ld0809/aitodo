import { Repository } from 'typeorm';
import { Card } from '../../database/entities/card.entity';
import { TapdConfig as TapdConfigEntity } from '../../database/entities/tapd-config.entity';
import { TapdPlugin } from './tapd.plugin';

function createCard(): Card {
  return {
    id: 'card-1',
    userId: 'user-1',
    user: null as never,
    name: 'TAPD Card',
    cardType: 'personal',
    status: 'active',
    sortBy: 'created_at',
    sortOrder: 'desc',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    pluginType: 'tapd',
    pluginConfigJson: null,
    tags: [],
    participants: [],
    todos: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('TapdPlugin', () => {
  let plugin: TapdPlugin;
  let tapdService: {
    getConfig: jest.Mock;
    getStoryStatusLabelMap: jest.Mock;
    getBugStatusLabelMap: jest.Mock;
    fetchRequirements: jest.Mock;
    fetchBugs: jest.Mock;
  };
  let tapdConfigRepository: {
    findOne: jest.Mock;
  };

  beforeEach(() => {
    tapdService = {
      getConfig: jest.fn().mockReturnValue({ workspaceId: '54330609' }),
      getStoryStatusLabelMap: jest.fn().mockResolvedValue({}),
      getBugStatusLabelMap: jest.fn().mockResolvedValue({}),
      fetchRequirements: jest.fn().mockResolvedValue([]),
      fetchBugs: jest.fn().mockResolvedValue([]),
    };
    tapdConfigRepository = {
      findOne: jest.fn(),
    };

    plugin = new TapdPlugin(
      tapdService as never,
      tapdConfigRepository as unknown as Repository<TapdConfigEntity>,
    );
  });

  it('applies requirement and bug status filters separately', async () => {
    await plugin.fetchItems({
      userId: 'user-1',
      cardId: 'card-1',
      card: createCard(),
      config: {
        workspaceId: '54330609',
        contentType: 'all',
        requirementStatuses: ['planning', 'developing'],
        bugStatuses: ['open', 'testing'],
      },
    });

    expect(tapdService.fetchRequirements).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: '54330609',
      status: 'planning,developing',
    }));
    expect(tapdService.fetchBugs).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: '54330609',
      status: 'open,testing',
    }));
  });

  it('falls back to legacy status config for both requirements and bugs', async () => {
    await plugin.fetchItems({
      userId: 'user-1',
      cardId: 'card-1',
      card: createCard(),
      config: {
        workspaceId: '54330609',
        contentType: 'all',
        status: 'in_progress',
      },
    });

    expect(tapdService.fetchRequirements).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: '54330609',
      status: 'in_progress',
    }));
    expect(tapdService.fetchBugs).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: '54330609',
      status: 'in_progress',
    }));
  });
});
