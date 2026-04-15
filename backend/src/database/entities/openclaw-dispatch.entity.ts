import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OpenClawBinding } from './openclaw-binding.entity';
import { Todo } from './todo.entity';
import { User } from './user.entity';

export type OpenClawDispatchStatus = 'pending' | 'dispatched' | 'completed' | 'failed' | 'superseded';

@Entity('openclaw_dispatches')
@Index('idx_openclaw_dispatch_user_todo_hash', ['userId', 'todoId', 'requestContentHash'])
export class OpenClawDispatch {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'binding_id' })
  bindingId!: string;

  @ManyToOne(() => OpenClawBinding, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'binding_id' })
  binding!: OpenClawBinding;

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

  @Column({ name: 'target_node_id', type: 'varchar', nullable: true })
  targetDeviceLabel!: string | null;

  @Column({ name: 'triggered_by_user_id', type: 'varchar', nullable: true })
  triggeredByUserId!: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  status!: OpenClawDispatchStatus;

  @Column({ name: 'request_content_hash', length: 64 })
  requestContentHash!: string;

  @Column({ name: 'callback_token', length: 64 })
  callbackToken!: string;

  @Column({ name: 'callback_url', type: 'text', nullable: true })
  callbackUrl!: string | null;

  @Column({ name: 'request_payload_json', type: 'text', nullable: true })
  requestPayloadJson!: string | null;

  @Column({ name: 'gateway_response_json', type: 'text', nullable: true })
  gatewayResponseJson!: string | null;

  @Column({ name: 'result_text', type: 'text', nullable: true })
  resultText!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
