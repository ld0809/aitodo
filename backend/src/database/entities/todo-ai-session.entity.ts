import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Todo } from './todo.entity';
import { TodoAiMessage } from './todo-ai-message.entity';
import { TodoAiSuggestion } from './todo-ai-suggestion.entity';

export type TodoAiSessionStatus = 'active' | 'archived';

@Entity('todo_ai_sessions')
@Index('ux_todo_ai_sessions_todo_id', ['todoId'], { unique: true })
export class TodoAiSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'todo_id' })
  todoId!: string;

  @ManyToOne(() => Todo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'todo_id' })
  todo!: Todo;

  @Column({ name: 'session_key', type: 'varchar', unique: true })
  sessionKey!: string;

  @Column({ type: 'varchar', default: 'active' })
  status!: TodoAiSessionStatus;

  @Column({ name: 'last_message_at', type: 'datetime', nullable: true })
  lastMessageAt!: Date | null;

  @OneToMany(() => TodoAiMessage, (message) => message.session)
  messages!: TodoAiMessage[];

  @OneToMany(() => TodoAiSuggestion, (suggestion) => suggestion.session)
  suggestions!: TodoAiSuggestion[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
