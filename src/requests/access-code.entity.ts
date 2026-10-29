import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// One-time code emailed to a customer so they can see their requests without an account.
// Only a hash is stored, never the code itself.
@Entity("access_codes")
@Index(["email", "createdAt"])
export class AccessCode {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 160 })
  email: string;

  @Column({ type: "varchar", length: 64 })
  codeHash: string;

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "int", default: 0 })
  attempts: number;

  @Column({ type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}