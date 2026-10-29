import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { User } from "../../users/user.entity.js";

@Entity("auth_sessions")
@Index(["userId"])
@Index(["expiresAt"])
export class AuthSession {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "userId" })
  user: Relation<User>;

  @Column({ type: "varchar", length: 64, unique: true })
  tokenHash: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  previousTokenHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
  rotatedAt: Date | null;

  @Column({ type: "boolean", default: false })
  rememberMe: boolean;

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}