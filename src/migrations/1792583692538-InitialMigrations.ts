import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigrations1792583692538 implements MigrationInterface {
    name = 'InitialMigrations1792583692538'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('dev', 'admin', 'hr', 'finance', 'staff', 'user')`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "names" character varying(250) NOT NULL, "email" character varying(160) NOT NULL, "phoneNumber" character varying(20) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "createdById" uuid, "updatedById" uuid, "deletedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3676155292d72c67cd4e090514" ON "users"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_ace513fa30d485cfd25c11a9e4" ON "users"  ("role") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_phone_active" ON "users"  ("phoneNumber") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_active" ON "users"  ("email") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE TABLE "services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "slug" character varying(200) NOT NULL, "description" text, "subDescription" character varying, "tags" jsonb NOT NULL DEFAULT '[]'::jsonb, "isActive" boolean NOT NULL DEFAULT true, "createdById" uuid, "updatedById" uuid, "deletedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6d149e510fc4de20510200ed76" ON "services"  ("isActive") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_services_slug_active" ON "services"  ("slug") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_action_enum" AS ENUM('create', 'update', 'delete', 'status', 'upload', 'payment', 'login')`);
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_entity_enum" AS ENUM('request', 'customer', 'quotation', 'payment', 'document', 'user', 'service')`);
        await queryRunner.query(`CREATE TABLE "activity_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid, "actorName" character varying(150), "action" "public"."activity_logs_action_enum" NOT NULL, "entity" "public"."activity_logs_entity_enum" NOT NULL, "entityId" character varying(64), "summary" character varying(255) NOT NULL, "changes" jsonb, "ip" character varying(64), "userAgent" character varying(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f25287b6140c5ba18d38776a796" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f0047f495923090bdd554b219c" ON "activity_logs"  ("entity", "entityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_95355d75c728050aae956cf016" ON "activity_logs"  ("createdAt") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_51d635f1d983d505fb5a2f44c52" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_52e97c477859f8019f3705abd21" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_e9d50c91bd84f566ce0ac1acf44" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_82587938299a04adef7aa22082f" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_efa99743a3edcbad4a6ce3a17a0" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_5e6c5598f4971023db9b61abdf9" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_5e6c5598f4971023db9b61abdf9"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_efa99743a3edcbad4a6ce3a17a0"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_82587938299a04adef7aa22082f"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_e9d50c91bd84f566ce0ac1acf44"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_52e97c477859f8019f3705abd21"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_51d635f1d983d505fb5a2f44c52"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_95355d75c728050aae956cf016"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0047f495923090bdd554b219c"`);
        await queryRunner.query(`DROP TABLE "activity_logs"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_entity_enum"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_action_enum"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_services_slug_active"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6d149e510fc4de20510200ed76"`);
        await queryRunner.query(`DROP TABLE "services"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_email_active"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_phone_active"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ace513fa30d485cfd25c11a9e4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3676155292d72c67cd4e090514"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
