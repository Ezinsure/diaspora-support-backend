import { Column, Entity, Index } from "typeorm";
import { Audited } from "../common/audited.entity.js";

@Entity("faqs")
@Index("UQ_faqs_slug_active", ["slug"], { unique: true, where: `"deletedAt" IS NULL` })
@Index(["sortOrder"])

export class Faq extends Audited {
  @Column({ type: "varchar", length: 500 })
  question: string;

  @Column({ type: "varchar", length: 520 })
  slug: string;

  @Column({ type: "text" })
  answer: string;

  @Column({ type: "int", default: 0 })
  sortOrder: number;

  // false = draft / hidden from the public
  @Column({ type: "boolean", default: true })
  isPublished: boolean;
}