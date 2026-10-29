import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from "typeorm";
import { Audited } from "../common/audited.entity.js";
import type { ServiceRequest } from "./request.entity.js";

// A file uploaded for a request (passport scan, ID, certificate...). createdBy = who uploaded it.
@Entity("request_documents")
@Index(["requestId"])
export class RequestDocument extends Audited {
  @Column({ type: "uuid" })
  requestId: string;

  @ManyToOne("ServiceRequest", "documents", { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "requestId" })
  request: Relation<ServiceRequest>;

  // e.g. "National ID" (optional label chosen when uploading)
  @Column({ type: "varchar", length: 120, nullable: true })
  label: string | null;

  // Original file name
  @Column({ type: "varchar", length: 255 })
  fileName: string;

  @Column({ type: "varchar", length: 100 })
  mimeType: string;

  @Column({ type: "int" })
  size: number;

  // Where it is in the storage bucket (never sent as a public URL)
  @Column({ type: "varchar", length: 400, unique: true, select: false })
  storagePath: string;
}