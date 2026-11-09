import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from "typeorm";
import { Audited } from "../common/audited.entity.js";
import { numeric } from "./request.types.js";
import type { ServiceRequest } from "./request.entity.js";

export enum PaymentChannel {
  CARD = "card",
  MOMO = "momo",
}

export enum PaymentLinkStatus {
  OPEN = "open",
  PAID = "paid",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
}

@Entity("payment_links")
@Index(["requestId"])
@Index("UQ_payment_links_open_per_request", ["requestId"], {
  unique: true,
  where: `"status" = 'open' AND "deletedAt" IS NULL`,
})
export class PaymentLink extends Audited {
  @Column({ type: "uuid" })
  requestId: string;

  @ManyToOne("ServiceRequest", { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "requestId" })
  request: Relation<ServiceRequest>;

  @Column({ type: "varchar", length: 20, default: "irembopay" })
  provider: string;

  @Column({ type: "varchar", length: 30, unique: true })
  reference: string;

  @Column({ type: "varchar", length: 60, unique: true })
  invoiceNumber: string;

  @Column({ type: "enum", enum: PaymentChannel, default: PaymentChannel.CARD })
  channel: PaymentChannel;

  @Column({ type: "numeric", precision: 14, scale: 2, transformer: numeric })
  amount: number;

  @Column({ type: "varchar", length: 3 })
  currency: string;

  @Column({ type: "numeric", precision: 14, scale: 2, transformer: numeric })
  chargeAmount: number;

  @Column({ type: "varchar", length: 3 })
  chargeCurrency: string;

  @Column({ type: "numeric", precision: 14, scale: 4, transformer: numeric, nullable: true })
  rate: number | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  payerPhone: string | null;

  @Column({ type: "text" })
  url: string;

  @Column({ type: "enum", enum: PaymentLinkStatus, default: PaymentLinkStatus.OPEN })
  status: PaymentLinkStatus;

  @Column({ type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  paymentId: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  paymentMethod: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  providerRef: string | null;
}