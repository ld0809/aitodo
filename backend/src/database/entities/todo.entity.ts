import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Card } from './card.entity';
import { Tag } from './tag.entity';
import { TodoCalendarSyncRecord } from './todo-calendar-sync.entity';
import { TodoProgressEntry } from './todo-progress.entity';
import { User } from './user.entity';

@Entity('todos')
export class Todo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.todos, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ name: 'card_id', type: 'varchar', nullable: true })
  cardId!: string | null;

  @ManyToOne(() => Card, (card) => card.todos, { onDelete: 'CASCADE', nullable: true })
  card!: Card | null;

  @Column()
  content!: string;

  @Column({ name: 'due_at', type: 'datetime', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'execute_at', type: 'datetime', nullable: true })
  executeAt!: Date | null;

  @Column({ default: 'todo' })
  status!: 'todo' | 'done' | 'completed';

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'progress_count', type: 'integer', default: 0 })
  progressCount!: number;

  @ManyToMany(() => Tag, (tag) => tag.todos)
  @JoinTable({
    name: 'todo_tags',
    joinColumn: { name: 'todo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags!: Tag[];

  @ManyToMany(() => User, (user) => user.assignedTodos)
  @JoinTable({
    name: 'todo_assignees',
    joinColumn: { name: 'todo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  assignees!: User[];

  @OneToMany(() => TodoProgressEntry, (entry) => entry.todo)
  progressEntries!: TodoProgressEntry[];

  @OneToMany(() => TodoCalendarSyncRecord, (record) => record.todo)
  calendarSyncRecords!: TodoCalendarSyncRecord[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
