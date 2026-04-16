import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Card, type CardStatus } from '../database/entities/card.entity';
import { CardUserLayout } from '../database/entities/card-user-layout.entity';
import { Tag } from '../database/entities/tag.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { PluginExecutor } from '../plugins/plugin-executor.service';
import { CardsService } from './cards.service';

function createUser(id: string, email: string): User {
  return {
    id,
    email,
    passwordHash: 'hash',
    nickname: '',
    avatarUrl: '',
    target: '',
    emailVerified: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    emailCodes: [],
    tags: [],
    todos: [],
    todoProgressEntries: [],
    cards: [],
    sharedCards: [],
    assignedTodos: [],
    todoCalendarSyncRecords: [],
    miniappBinding: null,
    openClawBinding: null,
    ownedOrganizations: [],
    organizations: [],
  };
}

function createCard(owner: User, options?: {
  status?: CardStatus;
  cardType?: 'personal' | 'shared';
  participants?: User[];
}): Card {
  return {
    id: 'card-1',
    userId: owner.id,
    user: owner,
    name: 'Archive Me',
    cardType: options?.cardType ?? 'personal',
    status: options?.status ?? 'active',
    sortBy: 'created_at',
    sortOrder: 'desc',
    x: 0,
    y: 0,
    w: 4,
    h: 3,
    pluginType: 'local_todo',
    pluginConfigJson: null,
    tags: [],
    participants: options?.participants ?? [],
    todos: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('CardsService', () => {
  let service: CardsService;
  let cardRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let cardUserLayoutRepository: {
    find: jest.Mock;
    save: jest.Mock;
  };
  let tagRepository: {
    find: jest.Mock;
  };
  let userRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let todoRepository: Record<string, never>;
  let dataSource: {
    manager: {
      find: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };
    transaction: jest.Mock;
  };
  let pluginExecutor: {
    fetchCardTodos: jest.Mock;
  };

  beforeEach(() => {
    cardRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    cardUserLayoutRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };
    tagRepository = {
      find: jest.fn(),
    };
    userRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    todoRepository = {};
    dataSource = {
      manager: {
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
      transaction: jest.fn(),
    };
    pluginExecutor = {
      fetchCardTodos: jest.fn(),
    };

    service = new CardsService(
      cardRepository as unknown as Repository<Card>,
      cardUserLayoutRepository as unknown as Repository<CardUserLayout>,
      tagRepository as unknown as Repository<Tag>,
      userRepository as unknown as Repository<User>,
      todoRepository as unknown as Repository<Todo>,
      dataSource as never,
      pluginExecutor as unknown as PluginExecutor,
    );
  });

  it('archives an owned card and returns the archived card response', async () => {
    const owner = createUser('owner-1', 'owner@test.com');
    const card = createCard(owner);
    cardRepository.findOne.mockResolvedValueOnce(card).mockResolvedValueOnce(card);
    cardRepository.save.mockImplementation(async (value) => value);
    userRepository.find.mockResolvedValue([owner]);

    const result = await service.archive(owner.id, card.id);

    expect(cardRepository.save).toHaveBeenCalledTimes(1);
    expect(card.status).toBe('archived');
    expect(result.status).toBe('archived');
    expect(result.userId).toBe(owner.id);
  });

  it('prevents participants from opening archived shared cards', async () => {
    const owner = createUser('owner-1', 'owner@test.com');
    const participant = createUser('member-1', 'member@test.com');
    const archivedSharedCard = createCard(owner, {
      status: 'archived',
      cardType: 'shared',
      participants: [participant],
    });
    cardRepository.findOne.mockResolvedValue(archivedSharedCard);

    await expect(service.findOne(participant.id, archivedSharedCard.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unsupported card status filters', async () => {
    await expect(service.findAll('owner-1', undefined, 'deleted' as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(cardRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
