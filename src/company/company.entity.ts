import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from "typeorm";
import { User } from "../users/user.entity.js";

export class Address {
  @Column({ type: "varchar", nullable: true })
  district: string | null;

  @Column({ type: "varchar", nullable: true })
  city: string | null;

  @Column({ type: "varchar", nullable: true })
  country: string | null;
}

@Entity("company_profile")
export class CompanyProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Always "main" + unique -> the database itself refuses a second row
  @Column({ type: "varchar", length: 10, default: "main", unique: true, select: false })
  key: string;

  @Column({ type: "varchar", length: 250 })
  name: string;

  @Column({ type: "text", nullable: true })
  about: string | null;

  @Column({ type: "varchar",  nullable: true })
  logoUrl: string | null;

  @Column({ type: "varchar", nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  websiteUrl: string | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  linkedinUrl: string | null;

  @Column(() => Address)
  address: Address;

  @Column({ type: "uuid", nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "updatedById" })
  updatedBy: Relation<User> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}