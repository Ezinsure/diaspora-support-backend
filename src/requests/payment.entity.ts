import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from "typeorm";
import { Audited } from "../common/audited.entity.js";
import { numeric, PaymentMethod } from "./request.types.js";
import type { ServiceRequest } from "./request.entity.js";

// One payment for a request. createdBy = who recorded it.
// Never edited; a mistake is "voided" (soft delete + reason) and recorded again.
@Entity("payments")
@Index(["requestId"])
@Index(["paidAt"])
// The same MoMo / bank transaction can't be recorded twice
@Index("UQ_payments_transaction_ref_active", ["transactionRef"], {
  unique: true,
  where: `"deletedAt" IS NULL AND "transactionRef" IS NOT NULL`,
})
export class Payment extends Audited {
  @Column({ type: "uuid" })
  requestId: string;

  @ManyToOne("ServiceRequest", "payments", { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "requestId" })
  request: Relation<ServiceRequest>;

  // RCT-2026-0001
  @Column({ type: "varchar", length: 20, unique: true })
  receiptNumber: string;

  @Column({ type: "numeric", precision: 14, scale: 2, transformer: numeric })
  amount: number;

  @Column({ type: "varchar", length: 3 })
  currency: string;

  @Column({ type: "enum", enum: PaymentMethod })
  method: PaymentMethod;

  // MoMo / bank transaction id
  @Column({ type: "varchar", length: 100, nullable: true })
  transactionRef: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  payerPhone: string | null;

  @Column({ type: "timestamptz" })
  paidAt: Date;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ type: "text", nullable: true })
  voidReason: string | null;
}