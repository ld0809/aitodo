import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Card } from './card.entity';
import { User } from './user.entity';

@Entity('card_user_layouts')
@Unique(['cardId', 'userId'])
export class CardUserLayout {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'card_id' })
  cardId!: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'integer', default: 0 })
  x!: number;

  @Column({ type: 'integer', default: 0 })
  y!: number;

  @Column({ type: 'integer', default: 4 })
  w!: number;

  @Column({ type: 'integer', default: 4 })
  h!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
