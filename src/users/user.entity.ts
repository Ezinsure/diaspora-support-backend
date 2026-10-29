import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';

export enum UserRole {
  DEV = 'dev',
  ADMIN = 'admin',
  HR = 'hr',
  FINANCE = 'finance',
  STAFF = 'staff',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// Unique among users that are NOT deleted@Entity("users")
@Entity("users")
@Index("UQ_users_email_active", ["email"], { unique: true, where: `"deletedAt" IS NULL` })
@Index("UQ_users_phone_active", ["phoneNumber"], { unique: true, where: `"deletedAt" IS NULL` })
@Index(["role"])
@Index(["status"])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 250 })
  names: string;

  @Column({ type: 'varchar', length: 160 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  // Login / security
  @Column({ type: "varchar", length: 255, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
  passwordSetAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastActiveAt: Date | null;

  @Column({ type: "int", default: 0, select: false })
  failedLoginCount: number;

  @Column({ type: "timestamptz", nullable: true, select: false })
  lockedUntil: Date | null;

  // +1 on password change / deactivation 
  @Column({ type: "int", default: 0, select: false })
  tokenVersion: number;

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
