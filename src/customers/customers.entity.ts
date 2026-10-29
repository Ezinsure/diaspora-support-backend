import { Column, Entity, Index, OneToMany, type Relation } from "typeorm";
import { Audited } from "../common/audited.entity.js";
import type { ServiceRequest } from "../requests/request.entity.js";

@Entity("customers")
@Index("UQ_customers_email_active", ["email"], { unique: true, where: `"deletedAt" IS NULL` })
@Index(["phone"])
export class Customer extends Audited {
  @Column({ type: "varchar", length: 100 })
  firstName: string;

  @Column({ type: "varchar", length: 100 })
  lastName: string;

  @Column({ type: "varchar", length: 160 })
  email: string;

  @Column({ type: "varchar", length: 20 })
  phone: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  country: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  timezone: string | null;

  @OneToMany("ServiceRequest", "customer")
  requests: Relation<ServiceRequest[]>;
}