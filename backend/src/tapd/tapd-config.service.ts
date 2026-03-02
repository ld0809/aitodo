import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TapdConfig } from '../database/entities/tapd-config.entity';
import { TapdService } from '../plugins/adapters/tapd.service';

export interface CreateTapdConfigDto {
  name: string;
  apiUrl: string;
  apiToken: string;
  workspaceId: string;
  isDefault?: boolean;
}

export interface UpdateTapdConfigDto {
  name?: string;
  apiUrl?: string;
  apiToken?: string;
  workspaceId?: string;
  isDefault?: boolean;
}

@Injectable()
export class TapdConfigService {
  constructor(
    @InjectRepository(TapdConfig)
    private readonly tapdConfigRepository: Repository<TapdConfig>,
    private readonly tapdService: TapdService,
  ) {}

  async create(dto: CreateTapdConfigDto): Promise<TapdConfig> {
    if (dto.isDefault) {
      await this.tapdConfigRepository.update({ isDefault: true }, { isDefault: false });
    }

    const config = this.tapdConfigRepository.create(dto);
    const saved = await this.tapdConfigRepository.save(config);
    
    // Initialize TAPD service with the new config
    this.tapdService.setConfig(saved.apiUrl, saved.apiToken);
    
    return saved;
  }

  async findAll(): Promise<TapdConfig[]> {
    return this.tapdConfigRepository.find({
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TapdConfig> {
    const config = await this.tapdConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`TAPD config with ID ${id} not found`);
    }
    return config;
  }

  async findDefault(): Promise<TapdConfig | null> {
    return this.tapdConfigRepository.findOne({ where: { isDefault: true } });
  }

  async update(id: string, dto: UpdateTapdConfigDto): Promise<TapdConfig> {
    const config = await this.findOne(id);
    
    if (dto.isDefault && !config.isDefault) {
      await this.tapdConfigRepository.update({ isDefault: true }, { isDefault: false });
    }

    Object.assign(config, dto);
    const updated = await this.tapdConfigRepository.save(config);
    
    // Re-initialize TAPD service if config changed
    if (dto.apiUrl || dto.apiToken) {
      const latest = await this.findOne(id);
      this.tapdService.setConfig(latest.apiUrl, latest.apiToken);
    }
    
    return updated;
  }

  async remove(id: string): Promise<void> {
    const config = await this.findOne(id);
    await this.tapdConfigRepository.remove(config);
  }

  async setDefault(id: string): Promise<TapdConfig> {
    await this.tapdConfigRepository.update({ isDefault: true }, { isDefault: false });
    return this.update(id, { isDefault: true });
  }
}
