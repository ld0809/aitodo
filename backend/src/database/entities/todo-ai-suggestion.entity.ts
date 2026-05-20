import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Todo } from './todo.entity';
import { TodoAiMessage } from './todo-ai-message.entity';
import { TodoAiSession } from './todo-ai-session.entity';
import { TodoProgressEntry } from './todo-progress.entity';
import { User } from './user.entity';

export type TodoAiSuggestionType = 'progress';
export type TodoAiSuggestionStatus = 'pending' | 'applied' | 'dismissed';

@Entity('todo_ai_suggestions')
@Index('idx_todo_ai_suggestions_todo_status', ['todoId', 'status'])
export class TodoAiSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => TodoAiSession, (session) => session.suggestions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: TodoAiSession;

  @Column({ name: 'todo_id' })
  todoId!: string;

  @ManyToOne(() => Todo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'todo_id' })
  todo!: Todo;

  @Column({ name: 'message_id' })
  messageId!: string;

  @ManyToOne(() => TodoAiMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message!: TodoAiMessage;

  @Column({ name: 'created_by_user_id' })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @Column({ type: 'varchar' })
  type!: TodoAiSuggestionType;

  @Column({ type: 'varchar', default: 'pending' })
  status!: TodoAiSuggestionStatus;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'applied_by_user_id', type: 'varchar', nullable: true })
  appliedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'applied_by_user_id' })
  appliedByUser!: User | null;

  @Column({ name: 'applied_progress_entry_id', type: 'varchar', nullable: true })
  appliedProgressEntryId!: string | null;

  @ManyToOne(() => TodoProgressEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'applied_progress_entry_id' })
  appliedProgressEntry!: TodoProgressEntry | null;

  @Column({ name: 'applied_at', type: 'datetime', nullable: true })
  appliedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
