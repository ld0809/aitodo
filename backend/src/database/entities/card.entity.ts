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
import { Tag } from './tag.entity';
import { Todo } from './todo.entity';
import { User } from './user.entity';

@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.cards, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  name!: string;

  @Column({ name: 'card_type', default: 'personal' })
  cardType!: 'personal' | 'shared';

  @Column({ name: 'sort_by', default: 'due_at' })
  sortBy!: 'due_at' | 'created_at' | 'execute_at';

  @Column({ name: 'sort_order', default: 'asc' })
  sortOrder!: 'asc' | 'desc';

  @Column({ type: 'integer', default: 0 })
  x!: number;

  @Column({ type: 'integer', default: 0 })
  y!: number;

  @Column({ type: 'integer', default: 4 })
  w!: number;

  @Column({ type: 'integer', default: 4 })
  h!: number;

  @Column({ name: 'plugin_type', default: 'local_todo' })
  pluginType!: string;

  @Column({ name: 'plugin_config_json', type: 'text', nullable: true })
  pluginConfigJson!: string | null;

  @ManyToMany(() => Tag, (tag) => tag.cards)
  @JoinTable({
    name: 'card_tags',
    joinColumn: { name: 'card_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags!: Tag[];

  @ManyToMany(() => User, (user) => user.sharedCards)
  @JoinTable({
    name: 'card_participants',
    joinColumn: { name: 'card_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  participants!: User[];

  @OneToMany(() => Todo, (todo) => todo.card)
  todos!: Todo[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
