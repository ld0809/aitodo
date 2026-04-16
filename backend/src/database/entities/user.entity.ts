import { Column, CreateDateColumn, Entity, ManyToMany, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Card } from './card.entity';
import { EmailCode } from './email-code.entity';
import { MiniappBinding } from './miniapp-binding.entity';
import { Organization } from './organization.entity';
import { OpenClawBinding } from './openclaw-binding.entity';
import { Tag } from './tag.entity';
import { TodoCalendarSyncRecord } from './todo-calendar-sync.entity';
import { TodoProgressEntry } from './todo-progress.entity';
import { Todo } from './todo.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ nullable: true })
  nickname!: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl!: string;

  @Column({ nullable: true })
  target!: string;

  @Column({ name: 'email_verified', default: false })
  emailVerified!: boolean;

  @Column({ default: 'active' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  @OneToMany(() => EmailCode, (emailCode) => emailCode.user)
  emailCodes!: EmailCode[];

  @OneToMany(() => Tag, (tag) => tag.user)
  tags!: Tag[];

  @OneToMany(() => Todo, (todo) => todo.user)
  todos!: Todo[];

  @OneToMany(() => TodoProgressEntry, (entry) => entry.user)
  todoProgressEntries!: TodoProgressEntry[];

  @OneToMany(() => Card, (card) => card.user)
  cards!: Card[];

  @ManyToMany(() => Card, (card) => card.participants)
  sharedCards!: Card[];

  @ManyToMany(() => Todo, (todo) => todo.assignees)
  assignedTodos!: Todo[];

  @OneToMany(() => Organization, (organization) => organization.owner)
  ownedOrganizations!: Organization[];

  @ManyToMany(() => Organization, (organization) => organization.members)
  organizations!: Organization[];

  @OneToMany(() => TodoCalendarSyncRecord, (record) => record.user)
  todoCalendarSyncRecords!: TodoCalendarSyncRecord[];

  @OneToOne(() => MiniappBinding, (binding) => binding.user)
  miniappBinding!: MiniappBinding | null;

  @OneToOne(() => OpenClawBinding, (binding) => binding.user)
  openClawBinding!: OpenClawBinding | null;
}
