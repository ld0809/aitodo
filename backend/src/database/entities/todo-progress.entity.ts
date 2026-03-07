import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Todo } from './todo.entity';
import { User } from './user.entity';

@Entity('todo_progress_entries')
@Index('idx_todo_progress_todo_created_at', ['todoId', 'createdAt'])
@Index('idx_todo_progress_user_created_at', ['userId', 'createdAt'])
export class TodoProgressEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'todo_id' })
  todoId!: string;

  @ManyToOne(() => Todo, (todo) => todo.progressEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'todo_id' })
  todo!: Todo;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.todoProgressEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
