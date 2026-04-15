import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenClawBinding } from '../database/entities/openclaw-binding.entity';
import { OpenClawDispatch } from '../database/entities/openclaw-dispatch.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { OpenClawController } from './openclaw.controller';
import { OpenClawService } from './openclaw.service';

@Module({
  imports: [TypeOrmModule.forFeature([OpenClawBinding, OpenClawDispatch, Todo, User])],
  controllers: [OpenClawController],
  providers: [OpenClawService],
  exports: [OpenClawService],
})
export class OpenClawModule {}
