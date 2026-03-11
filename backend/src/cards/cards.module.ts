import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../database/entities/card.entity';
import { CardUserLayout } from '../database/entities/card-user-layout.entity';
import { Tag } from '../database/entities/tag.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { PluginsModule } from '../plugins/plugins.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [TypeOrmModule.forFeature([Card, CardUserLayout, Tag, User, Todo]), PluginsModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
