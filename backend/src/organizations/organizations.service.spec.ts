import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Organization } from '../database/entities/organization.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsService } from './organizations.service';

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

function createOrganization(owner: User, members: User[]): Organization {
  return {
    id: 'org-1',
    name: '研发一组',
    ownerId: owner.id,
    owner,
    members,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let organizationRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let userRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    organizationRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    userRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    service = new OrganizationsService(
      organizationRepository as unknown as Repository<Organization>,
      userRepository as unknown as Repository<User>,
    );
  });

  it('allows organization owner to add a registered member and keeps member list unique', async () => {
    const owner = createUser('owner-1', 'owner@test.com');
    const member = createUser('member-1', 'member@test.com');
    const organization = createOrganization(owner, [owner]);
    (organizationRepository.findOne as jest.Mock).mockResolvedValue(organization);
    (userRepository.createQueryBuilder as jest.Mock).mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(member),
    });
    (organizationRepository.save as jest.Mock).mockImplementation(async (value) => value);

    const result = await service.addMember(owner.id, organization.id, { email: member.email });

    expect(organizationRepository.save).toHaveBeenCalledTimes(1);
    expect(result.email).toBe(member.email);
    expect(organization.members).toHaveLength(2);
  });

  it('rejects add member requests from non-owner members', async () => {
    const owner = createUser('owner-1', 'owner@test.com');
    const member = createUser('member-1', 'member@test.com');
    const organization = createOrganization(owner, [owner, member]);
    (organizationRepository.findOne as jest.Mock).mockResolvedValue(organization);

    await expect(service.addMember(member.id, organization.id, { email: 'next@test.com' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when target email is not registered', async () => {
    const owner = createUser('owner-1', 'owner@test.com');
    const organization = createOrganization(owner, [owner]);
    (organizationRepository.findOne as jest.Mock).mockResolvedValue(organization);
    (userRepository.createQueryBuilder as jest.Mock).mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });

    await expect(service.addMember(owner.id, organization.id, { email: 'missing@test.com' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
