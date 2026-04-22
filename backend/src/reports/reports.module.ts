import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { User } from '../database/entities/user.entity';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([TodoProgressEntry, User]), OpenClawModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
