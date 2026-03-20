import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('miniapp_bindings')
@Index('ux_miniapp_bindings_user', ['userId'], { unique: true })
@Index('ux_miniapp_bindings_open_id', ['miniOpenId'], { unique: true })
export class MiniappBinding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @OneToOne(() => User, (user) => user.miniappBinding, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'mini_open_id' })
  miniOpenId!: string;

  @Column({ name: 'mini_union_id', type: 'varchar', nullable: true })
  miniUnionId!: string | null;

  @Column({ name: 'mini_nickname', type: 'varchar', nullable: true })
  miniNickname!: string | null;

  @Column({ name: 'mini_avatar_url', type: 'varchar', nullable: true })
  miniAvatarUrl!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
