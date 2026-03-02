import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TapdConfig } from '../database/entities/tapd-config.entity';
import { TapdConfigService } from './tapd-config.service';
import { TapdController } from './tapd.controller';
import { TapdService } from '../plugins/adapters/tapd.service';
import { TapdPlugin } from '../plugins/adapters/tapd.plugin';

@Module({
  imports: [TypeOrmModule.forFeature([TapdConfig])],
  controllers: [TapdController],
  providers: [TapdConfigService, TapdService, TapdPlugin],
  exports: [TapdConfigService, TapdService],
})
export class TapdModule {}
