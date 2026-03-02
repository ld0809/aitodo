import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Card } from './card.entity';
import { Todo } from './todo.entity';
import { User } from './user.entity';

@Entity('tags')
@Unique(['userId', 'name'])
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.tags, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'varchar', length: 20 })
  name!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color!: string | null;

  @ManyToMany(() => Todo, (todo) => todo.tags)
  todos!: Todo[];

  @ManyToMany(() => Card, (card) => card.tags)
  cards!: Card[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
