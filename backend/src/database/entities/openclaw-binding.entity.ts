import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('openclaw_bindings')
export class OpenClawBinding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @OneToOne(() => User, (user) => user.openClawBinding, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'node_id', type: 'varchar', unique: true, nullable: true })
  connectToken!: string | null;

  @Column({ name: 'node_label', type: 'varchar', nullable: true })
  deviceLabel!: string | null;

  @Column({ name: 'pairing_status', type: 'varchar', default: 'paired' })
  connectionStatus!: 'pending' | 'connected' | 'disconnected' | 'revoked';

  @Column({ name: 'enabled', default: true })
  enabled!: boolean;

  @Column({ name: 'timeout_seconds', type: 'integer', default: 900 })
  timeoutSeconds!: number;

  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'last_dispatched_at', type: 'datetime', nullable: true })
  lastDispatchedAt!: Date | null;

  @Column({ name: 'last_completed_at', type: 'datetime', nullable: true })
  lastCompletedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
