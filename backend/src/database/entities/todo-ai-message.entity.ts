import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Todo } from './todo.entity';
import { TodoAiSession } from './todo-ai-session.entity';
import { User } from './user.entity';

export type TodoAiMessageRole = 'user' | 'assistant';

@Entity('todo_ai_messages')
@Index('idx_todo_ai_messages_session_created_at', ['sessionId', 'createdAt'])
@Index('idx_todo_ai_messages_todo_created_at', ['todoId', 'createdAt'])
export class TodoAiMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => TodoAiSession, (session) => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: TodoAiSession;

  @Column({ name: 'todo_id' })
  todoId!: string;

  @ManyToOne(() => Todo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'todo_id' })
  todo!: Todo;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar' })
  role!: TodoAiMessageRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'openclaw_dispatch_id', type: 'varchar', nullable: true })
  openClawDispatchId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
