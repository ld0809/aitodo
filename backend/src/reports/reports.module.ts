import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { User } from '../database/entities/user.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([TodoProgressEntry, User])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
