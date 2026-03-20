import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Todo } from './todo.entity';
import { User } from './user.entity';

@Entity('todo_calendar_sync_records')
@Index('ux_todo_calendar_sync_records_key', ['userId', 'todoId', 'deviceId'], { unique: true })
export class TodoCalendarSyncRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'todo_id' })
  todoId!: string;

  @ManyToOne(() => Todo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'todo_id' })
  todo!: Todo;

  @Column({ name: 'device_id' })
  deviceId!: string;

  @Column({ name: 'synced_deadline_at', type: 'datetime' })
  syncedDeadlineAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
