import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../users/user.entity.js';

// Shared columns for every table that tracks who did what.
// Not an @Entity itself: each table that "extends Audited" gets these columns.
// Links to users are SET NULL (never CASCADE): deleting a user never deletes data.
export abstract class Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User> | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedById' })
  updatedBy: Relation<User> | null;

  @Column({ type: 'uuid', nullable: true })
  deletedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deletedById' })
  deletedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

export const withPeople = (qb: any, alias: string) =>
  qb
    .leftJoin(`${alias}.createdBy`, 'createdBy')
    .addSelect(['createdBy.id', 'createdBy.names', 'createdBy.email'])
    .leftJoin(`${alias}.updatedBy`, 'updatedBy')
    .addSelect(['updatedBy.id', 'updatedBy.names', 'updatedBy.email']);
