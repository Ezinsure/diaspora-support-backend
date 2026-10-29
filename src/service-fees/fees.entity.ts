import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from "typeorm";
import { Audited } from "../common/audited.entity.js";
import { Service } from "../services/service.entity.js";

const toNumber = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : Number(v)),
};

@Entity("service_fees")
@Index("UQ_service_fees_service_slug_active", ["serviceId", "slug"], {
  unique: true,
  where: `"deletedAt" IS NULL AND "serviceId" IS NOT NULL`,
})

@Index("UQ_service_fees_general_slug_active", ["slug"], {
  unique: true,
  where: `"deletedAt" IS NULL AND "serviceId" IS NULL`,
})
@Index(["serviceId"])
@Index(["isActive"])
export class ServiceFee extends Audited {
  @Column({ type: "uuid", nullable: true })
  serviceId: string | null;

  @ManyToOne(() => Service, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "serviceId" })
  service: Relation<Service> | null;

  @Column({ type: "varchar", length: 200 })
  name: string;

  @Column({ type: "varchar", length: 240 })
  slug: string;

  @Column({ type: "numeric", precision: 14, scale: 2, transformer: toNumber })
  amount: number;

  @Column({ type: "varchar", length: 3, default: "USD" })
  currency: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;
}