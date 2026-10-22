import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LogAction, LogEntity } from './activity.type.js';

@Entity('activity_logs')
@Index(['createdAt'])
@Index(['entity', 'entityId'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  actorName: string | null;

  @Column({ type: 'enum', enum: LogAction })
  action: LogAction;

  @Column({ type: 'enum', enum: LogEntity })
  entity: LogEntity;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 255 })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  changes: any[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
