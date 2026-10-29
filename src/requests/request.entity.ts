import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from "typeorm";
import { Audited } from "../common/audited.entity.js";
import { Customer } from "../customers/customers.entity.js";
import { Service } from "../services/service.entity.js";
import { numeric, RequestSource, RequestStatus, type Proforma } from "./request.types.js";
import type { RequestDocument } from "./request-docs.entity.js";
import type { Payment } from "./payment.entity.js";

// "Request" is already a name in Express, so the class is ServiceRequest; the table is "requests".
@Entity("requests")
@Index(["status"])
@Index(["createdAt"])
@Index(["customerId"])
@Index(["serviceId"])
export class ServiceRequest extends Audited {
  // REQ-2026-0001 (shown to the customer)
  @Column({ type: "varchar", length: 20, unique: true })
  reference: string;

  @Column({ type: "uuid" })
  customerId: string;

  // RESTRICT: a customer with requests can't be removed from the database
  @ManyToOne(() => Customer, (c) => c.requests, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "customerId" })
  customer: Relation<Customer>;

  @Column({ type: "uuid", nullable: true })
  serviceId: string | null;

  @ManyToOne(() => Service, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "serviceId" })
  service: Relation<Service> | null;

  // Name at the time of the request (stays correct if the service is renamed / deleted)
  @Column({ type: "varchar", length: 120 })
  serviceName: string;

  // The customer's short description
  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: RequestStatus, default: RequestStatus.PENDING })
  status: RequestStatus;

  // Reason when cancelled / note on the last status change
  @Column({ type: "text", nullable: true })
  statusNote: string | null;

  @Column({ type: "timestamptz", nullable: true })
  statusChangedAt: Date | null;

  @Column({ type: "enum", enum: RequestSource, default: RequestSource.WEBSITE })
  source: RequestSource;

  // Documents we asked the customer for (after the call)
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  requiredDocuments: string[];

  // What the customer must pay: the proforma total, or an amount agreed on the phone
  @Column({ type: "numeric", precision: 14, scale: 2, nullable: true, transformer: numeric })
  amountDue: number | null;

  // Sum of recorded payments (kept up to date when payments change)
  @Column({ type: "numeric", precision: 14, scale: 2, default: 0, transformer: numeric })
  amountPaid: number;

  @Column({ type: "varchar", length: 3, default: "RWF" })
  currency: string;

  @Column({ type: "jsonb", nullable: true })
  proforma: Proforma | null;

  @OneToMany("RequestDocument", "request")
  documents: Relation<RequestDocument[]>;

  @OneToMany("Payment", "request")
  payments: Relation<Payment[]>;
}