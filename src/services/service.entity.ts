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
} from "typeorm";
import { User } from "../users/user.entity.js";

@Entity("services")
@Index("UQ_services_slug_active", ["slug"], { unique: true, where: `"deletedAt" IS NULL` })
@Index(["isActive"])
export class Service {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 200 })
  name: string;

  @Column({ type: "varchar", length: 200 })
  slug: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "varchar", nullable: true })
  subDescription: string | null;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  tags: string[];

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "uuid", nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "createdById" })
  createdBy: Relation<User> | null;

  @Column({ type: "uuid", nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "updatedById" })
  updatedBy: Relation<User> | null;

  @Column({ type: "uuid", nullable: true })
  deletedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "deletedById" })
  deletedBy: Relation<User> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deletedAt: Date | null;
}