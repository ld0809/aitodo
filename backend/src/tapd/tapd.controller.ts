import { Controller, Get, Post, Put, Delete, Body, Param, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { TapdConfigService, CreateTapdConfigDto, UpdateTapdConfigDto } from './tapd-config.service';
import { TapdService } from '../plugins/adapters/tapd.service';

@Controller('api')
export class TapdController {
  constructor(
    private readonly tapdConfigService: TapdConfigService,
    private readonly tapdService: TapdService,
  ) {}

  // Configuration endpoints
  @Post('tapd/configs')
  async createConfig(@Body() dto: CreateTapdConfigDto) {
    return this.tapdConfigService.create(dto);
  }

  @Get('tapd/configs')
  async findAllConfigs() {
    return this.tapdConfigService.findAll();
  }

  @Get('tapd/configs/:id')
  async findConfig(@Param('id') id: string) {
    return this.tapdConfigService.findOne(id);
  }

  @Put('tapd/configs/:id')
  async updateConfig(@Param('id') id: string, @Body() dto: UpdateTapdConfigDto) {
    return this.tapdConfigService.update(id, dto);
  }

  @Delete('tapd/configs/:id')
  async removeConfig(@Param('id') id: string) {
    await this.tapdConfigService.remove(id);
    return { success: true };
  }

  @Post('tapd/configs/:id/set-default')
  async setDefaultConfig(@Param('id') id: string) {
    return this.tapdConfigService.setDefault(id);
  }

  // Project endpoints
  @Get('projects')
  async getProjects(@Query('workspaceId') workspaceId?: string) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchProjects(wid);
  }

  @Get('projects/:projectId/iterations')
  async getIterations(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchIterations(wid, projectId);
  }

  @Get('projects/:projectId/users')
  async getUsers(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchUsers(wid, projectId);
  }

  @Get('projects/:projectId/versions')
  async getVersions(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchVersions(wid, projectId);
  }

  // Requirements endpoint
  @Get('requirements')
  async getRequirements(
    @Query('projectId') projectId: string,
    @Query('iterationId') iterationId?: string,
    @Query('ownerIds') ownerIds?: string,
    @Query('status') status?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    const ownerIdsArray = ownerIds ? ownerIds.split(',') : undefined;

    return this.tapdService.fetchRequirements({
      workspaceId: wid,
      projectId,
      iterationId,
      ownerIds: ownerIdsArray,
      status,
    });
  }

  // Bugs endpoint
  @Get('bugs')
  async getBugs(
    @Query('projectId') projectId: string,
    @Query('iterationId') iterationId?: string,
    @Query('title') title?: string,
    @Query('versionId') versionId?: string,
    @Query('ownerIds') ownerIds?: string,
    @Query('status') status?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    const ownerIdsArray = ownerIds ? ownerIds.split(',') : undefined;

    return this.tapdService.fetchBugs({
      workspaceId: wid,
      projectId,
      iterationId,
      title,
      versionId,
      ownerIds: ownerIdsArray,
      status,
    });
  }

  // Todos endpoint
  @Get('todos/:userId')
  async getTodos(
    @Param('userId') userId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchTodos(wid, userId);
  }
}
