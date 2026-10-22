import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFaqsCompanyFees1792685402662 implements MigrationInterface {
    name = 'AddFaqsCompanyFees1792685402662'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "company_profile" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(10) NOT NULL DEFAULT 'main', "name" character varying(250) NOT NULL, "about" text, "logoUrl" character varying, "phone" character varying, "email" character varying(160), "websiteUrl" character varying(300), "linkedinUrl" character varying(300), "updatedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "addressDistrict" character varying, "addressCity" character varying, "addressCountry" character varying, CONSTRAINT "UQ_10c902f54d474b2a9d72f6310b5" UNIQUE ("key"), CONSTRAINT "PK_058d1cfee40e5e53412ed7484b3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "faqs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdById" uuid, "updatedById" uuid, "deletedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "question" character varying(500) NOT NULL, "slug" character varying(520) NOT NULL, "answer" text NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "isPublished" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_2ddf4f2c910f8e8fa2663a67bf0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e4b25198fabb167d10f26400a3" ON "faqs"  ("sortOrder") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_faqs_slug_active" ON "faqs"  ("slug") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE TABLE "service_fees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdById" uuid, "updatedById" uuid, "deletedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "serviceId" uuid, "name" character varying(200) NOT NULL, "slug" character varying(240) NOT NULL, "amount" numeric(14,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'USD', "description" text, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_f289d96abe036ed8221bb40257d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8e34beb40e6b03909bb80846da" ON "service_fees"  ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_9e78ec960be71ea4a24d3fce9c" ON "service_fees"  ("serviceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_service_fees_general_slug_active" ON "service_fees"  ("slug") WHERE "deletedAt" IS NULL AND "serviceId" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_service_fees_service_slug_active" ON "service_fees"  ("serviceId", "slug") WHERE "deletedAt" IS NULL AND "serviceId" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0047f495923090bdd554b219c"`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_action_enum" ADD VALUE 'reorder'`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_entity_enum" ADD VALUE 'service_fee'`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_entity_enum" ADD VALUE 'faq'`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_entity_enum" ADD VALUE 'company'`);
        await queryRunner.query(`CREATE INDEX "IDX_f0047f495923090bdd554b219c" ON "activity_logs"  ("entity", "entityId") `);
        await queryRunner.query(`ALTER TABLE "company_profile" ADD CONSTRAINT "FK_e59b750c61d8ba5f406c5753396" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "faqs" ADD CONSTRAINT "FK_de7fae4f455a3e8c2228fe014fd" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "faqs" ADD CONSTRAINT "FK_b9be09469cff8a63ffc3ce5bc94" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "faqs" ADD CONSTRAINT "FK_68c1392ca68ddf88b9af9894bbd" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_fees" ADD CONSTRAINT "FK_97069485f3cae7a8213077d775e" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_fees" ADD CONSTRAINT "FK_0f908f7225a27d27b17b23c3921" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_fees" ADD CONSTRAINT "FK_e7bd5b184e3d8df5b2e077e0c38" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_fees" ADD CONSTRAINT "FK_9e78ec960be71ea4a24d3fce9c0" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "service_fees" DROP CONSTRAINT "FK_9e78ec960be71ea4a24d3fce9c0"`);
        await queryRunner.query(`ALTER TABLE "service_fees" DROP CONSTRAINT "FK_e7bd5b184e3d8df5b2e077e0c38"`);
        await queryRunner.query(`ALTER TABLE "service_fees" DROP CONSTRAINT "FK_0f908f7225a27d27b17b23c3921"`);
        await queryRunner.query(`ALTER TABLE "service_fees" DROP CONSTRAINT "FK_97069485f3cae7a8213077d775e"`);
        await queryRunner.query(`ALTER TABLE "faqs" DROP CONSTRAINT "FK_68c1392ca68ddf88b9af9894bbd"`);
        await queryRunner.query(`ALTER TABLE "faqs" DROP CONSTRAINT "FK_b9be09469cff8a63ffc3ce5bc94"`);
        await queryRunner.query(`ALTER TABLE "faqs" DROP CONSTRAINT "FK_de7fae4f455a3e8c2228fe014fd"`);
        await queryRunner.query(`ALTER TABLE "company_profile" DROP CONSTRAINT "FK_e59b750c61d8ba5f406c5753396"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0047f495923090bdd554b219c"`);
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_entity_enum_old" AS ENUM('request', 'customer', 'quotation', 'payment', 'document', 'user', 'service')`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ALTER COLUMN "entity" TYPE "public"."activity_logs_entity_enum_old" USING "entity"::"text"::"public"."activity_logs_entity_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_entity_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_entity_enum_old" RENAME TO "activity_logs_entity_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_action_enum_old" AS ENUM('create', 'update', 'delete', 'status', 'upload', 'payment', 'login')`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ALTER COLUMN "action" TYPE "public"."activity_logs_action_enum_old" USING "action"::"text"::"public"."activity_logs_action_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_action_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_action_enum_old" RENAME TO "activity_logs_action_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_f0047f495923090bdd554b219c" ON "activity_logs" USING btree ("entity", "entityId") `);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "tags" SET DEFAULT '[]'`);
        await queryRunner.query(`DROP INDEX "public"."UQ_service_fees_service_slug_active"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_service_fees_general_slug_active"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9e78ec960be71ea4a24d3fce9c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8e34beb40e6b03909bb80846da"`);
        await queryRunner.query(`DROP TABLE "service_fees"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_faqs_slug_active"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4b25198fabb167d10f26400a3"`);
        await queryRunner.query(`DROP TABLE "faqs"`);
        await queryRunner.query(`DROP TABLE "company_profile"`);
    }

}
