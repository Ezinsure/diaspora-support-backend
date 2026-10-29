import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { User } from "../../users/user.entity.js";

export enum PasswordTokenType {
  INVITE = "invite",
  RESET = "reset",
}

// One-time link sent by email.
@Entity("password_tokens")
@Index(["userId", "type"])
export class PasswordToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "userId" })
  user: Relation<User>;

  @Column({ type: "enum", enum: PasswordTokenType })
  type: PasswordTokenType;

  @Column({ type: "varchar", length: 64, unique: true })
  tokenHash: string;

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "timestamptz", nullable: true })
  usedAt: Date | null;

  // Who asked for it 
  @Column({ type: "uuid", nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}