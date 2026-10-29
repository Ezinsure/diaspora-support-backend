import { Column, Entity, EntityManager, PrimaryColumn } from "typeorm";

// Running numbers: "REQ-2026" -> 1, 2, 3...  (one row per prefix + year)
@Entity("counters")
export class Counter {
  @PrimaryColumn({ type: "varchar", length: 40 })
  key: string;

  @Column({ type: "int", default: 0 })
  value: number;
}

// Next number for a key, safe when two requests arrive at the same moment
// (one atomic INSERT ... ON CONFLICT UPDATE ... RETURNING).
export const nextNumber = async (em: EntityManager, key: string): Promise<number> => {
  const rows = await em.query(
    `INSERT INTO counters ("key", "value") VALUES ($1, 1)
     ON CONFLICT ("key") DO UPDATE SET "value" = counters."value" + 1
     RETURNING "value"`,
    [key],
  );
  return Number(rows[0].value);
};

// "REQ" -> "REQ-2026-0001" (year in Kigali time, at least 4 digits)
export const nextReference = async (em: EntityManager, prefix: string) => {
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kigali" }).slice(0, 4);
  const n = await nextNumber(em, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
};