import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../database/entities/organization.entity';
import { User } from '../database/entities/user.entity';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const owner = await this.userRepository.findOne({ where: { id: userId } });
    if (!owner) {
      throw new NotFoundException('user not found');
    }

    const organization = this.organizationRepository.create({
      name: dto.name.trim(),
      ownerId: userId,
      owner,
      members: [owner],
    });

    const savedOrganization = await this.organizationRepository.save(organization);
    const createdOrganization = await this.findAccessibleOrganizationOrThrow(userId, savedOrganization.id);
    return this.toOrganizationResponse(createdOrganization);
  }

  async findAll(userId: string) {
    const organizations = await this.organizationRepository
      .createQueryBuilder('organization')
      .leftJoinAndSelect('organization.owner', 'owner')
      .leftJoinAndSelect('organization.members', 'member')
      .leftJoin('organization.members', 'accessibleMember')
      .where('organization.owner_id = :userId', { userId })
      .orWhere('accessibleMember.id = :userId', { userId })
      .orderBy('organization.created_at', 'DESC')
      .distinct(true)
      .getMany();

    return organizations.map((organization) => this.toOrganizationResponse(organization));
  }

  async findMembers(userId: string, organizationId: string) {
    const organization = await this.findAccessibleOrganizationOrThrow(userId, organizationId);
    return (organization.members ?? []).map((member) => this.toMemberResponse(member));
  }

  async addMember(userId: string, organizationId: string, dto: AddOrganizationMemberDto) {
    const organization = await this.findOwnedOrganizationOrThrow(userId, organizationId);
    const email = dto.email.trim().toLowerCase();
    const member = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .getOne();

    if (!member) {
      throw new NotFoundException('该邮箱尚未注册，无法加入组织');
    }

    const members = organization.members ?? [];
    if (!members.some((item) => item.id === member.id)) {
      organization.members = [...members, member];
      await this.organizationRepository.save(organization);
    }

    return this.toMemberResponse(member);
  }

  private async findOwnedOrganizationOrThrow(userId: string, organizationId: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: {
        owner: true,
        members: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('organization not found');
    }

    if (organization.ownerId !== userId) {
      throw new ForbiddenException('only organization owner can manage members');
    }

    return organization;
  }

  private async findAccessibleOrganizationOrThrow(userId: string, organizationId: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: {
        owner: true,
        members: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('organization not found');
    }

    const members = organization.members ?? [];
    if (organization.ownerId !== userId && !members.some((member) => member.id === userId)) {
      throw new NotFoundException('organization not found');
    }

    return organization;
  }

  private toOrganizationResponse(organization: Organization) {
    return {
      id: organization.id,
      name: organization.name,
      ownerId: organization.ownerId,
      owner: organization.owner ? this.toMemberResponse(organization.owner) : undefined,
      memberCount: organization.members?.length ?? 0,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }

  private toMemberResponse(member: User) {
    return {
      id: member.id,
      email: member.email,
      nickname: member.nickname,
    };
  }
}
