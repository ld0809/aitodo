import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  findAll(@CurrentUser() user: { userId: string }) {
    return this.organizationsService.findAll(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(user.userId, dto);
  }

  @Get(':id/members')
  findMembers(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.organizationsService.findMembers(user.userId, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: AddOrganizationMemberDto) {
    return this.organizationsService.addMember(user.userId, id, dto);
  }
}
