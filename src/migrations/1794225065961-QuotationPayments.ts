import { MigrationInterface, QueryRunner } from "typeorm";

export class QuotationPayments1794225065961 implements MigrationInterface {
    name = 'QuotationPayments1794225065961'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payment_links_channel_enum" AS ENUM('card', 'momo')`);
        await queryRunner.query(`CREATE TYPE "public"."payment_links_status_enum" AS ENUM('open', 'paid', 'cancelled', 'expired')`);
        await queryRunner.query(`CREATE TABLE "payment_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdById" uuid, "updatedById" uuid, "deletedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "requestId" uuid NOT NULL, "provider" character varying(20) NOT NULL DEFAULT 'irembopay', "reference" character varying(30) NOT NULL, "invoiceNumber" character varying(60) NOT NULL, "channel" "public"."payment_links_channel_enum" NOT NULL DEFAULT 'card', "amount" numeric(14,2) NOT NULL, "currency" character varying(3) NOT NULL, "chargeAmount" numeric(14,2) NOT NULL, "chargeCurrency" character varying(3) NOT NULL, "rate" numeric(14,4), "payerPhone" character varying(20), "url" text NOT NULL, "status" "public"."payment_links_status_enum" NOT NULL DEFAULT 'open', "expiresAt" TIMESTAMP WITH TIME ZONE, "paidAt" TIMESTAMP WITH TIME ZONE, "paymentId" uuid, "paymentMethod" character varying(40), "providerRef" character varying(100), CONSTRAINT "UQ_bc6ff5fa86ade7b993a159ca81f" UNIQUE ("reference"), CONSTRAINT "UQ_d4f723eed416c4384d9271831da" UNIQUE ("invoiceNumber"), CONSTRAINT "PK_5b176ff8200166713c53d6c3ada" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_payment_links_open_per_request" ON "payment_links"  ("requestId") WHERE "status" = 'open' AND "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_56c97b232d4be042871f1d4c19" ON "payment_links"  ("requestId") `);
        await queryRunner.query(`ALTER TYPE "public"."payments_method_enum" ADD VALUE 'irembopay'`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "requests" ALTER COLUMN "requiredDocuments" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "payment_links" ADD CONSTRAINT "FK_1b4cbcdbd7eaca8944f41aae273" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment_links" ADD CONSTRAINT "FK_418394a7fffd2f8e3199ab50272" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment_links" ADD CONSTRAINT "FK_df33127a1f0c8c46b74c8a962de" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment_links" ADD CONSTRAINT "FK_56c97b232d4be042871f1d4c19c" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment_links" DROP CONSTRAINT "FK_56c97b232d4be042871f1d4c19c"`);
        await queryRunner.query(`ALTER TABLE "payment_links" DROP CONSTRAINT "FK_df33127a1f0c8c46b74c8a962de"`);
        await queryRunner.query(`ALTER TABLE "payment_links" DROP CONSTRAINT "FK_418394a7fffd2f8e3199ab50272"`);
        await queryRunner.query(`ALTER TABLE "payment_links" DROP CONSTRAINT "FK_1b4cbcdbd7eaca8944f41aae273"`);
        await queryRunner.query(`ALTER TABLE "requests" ALTER COLUMN "requiredDocuments" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "tags" SET DEFAULT '[]'`);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum_old" AS ENUM('mobile_money', 'bank_transfer', 'card', 'cash', 'other')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."payments_method_enum_old" USING "method"::"text"::"public"."payments_method_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_method_enum_old" RENAME TO "payments_method_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_56c97b232d4be042871f1d4c19"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_payment_links_open_per_request"`);
        await queryRunner.query(`DROP TABLE "payment_links"`);
        await queryRunner.query(`DROP TYPE "public"."payment_links_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payment_links_channel_enum"`);
    }

}
