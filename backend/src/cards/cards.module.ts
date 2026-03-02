import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../database/entities/card.entity';
import { Tag } from '../database/entities/tag.entity';
import { PluginsModule } from '../plugins/plugins.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [TypeOrmModule.forFeature([Card, Tag]), PluginsModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
