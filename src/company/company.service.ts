import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { CompanyProfile } from "./company.entity.js";
import { UpdateCompanyProfileDto, UpsertCompanyProfileDto } from "./company.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";

const TRACKED = ["name", "about", "logoUrl", "phone", "email", "websiteUrl", "linkedinUrl", "address"];
const EMPTY_ADDRESS = { district: null, city: null, country: null };

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyProfile) private readonly repo: Repository<CompanyProfile>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
  ) {}

  async get() {
    return this.repo
      .createQueryBuilder("company")
      .leftJoin("company.updatedBy", "updatedBy")
      .addSelect(["updatedBy.id", "updatedBy.names", "updatedBy.email"])
      .getOne();
  }

  async upsert(dto: UpsertCompanyProfileDto, ctx: AuditContext) {
    const full = {
      name: dto.name,
      about: dto.about ?? null,
      logoUrl: dto.logoUrl ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      websiteUrl: dto.websiteUrl ?? null,
      linkedinUrl: dto.linkedinUrl ?? null,
      address: { ...EMPTY_ADDRESS, ...(dto.address ?? {}) },
    };
    return this.save(full, ctx, true);
  }

  // PATCH: change only what was sent (profile must exist)
  async update(dto: UpdateCompanyProfileDto, ctx: AuditContext) {
    return this.save(dto, ctx, false);
  }

  private async save(values: any, ctx: AuditContext, createIfMissing: boolean) {
    await this.dataSource.transaction(async (em) => {
      let company = await em.findOne(CompanyProfile, { where: {} });

      if (!company) {
        if (!createIfMissing) throw new NotFoundException("Company profile not set yet. Use PUT to create it.");

        company = em.create(CompanyProfile, { ...values, updatedById: ctx.actorId });
        await em.save(company);
        await this.logs.log(ctx, { action: LogAction.CREATE, entity: LogEntity.COMPANY, entityId: company.id, summary: `Created company profile "${company.name}"` }, em);
        return;
      }

      // Merge address so PATCH { address: { city } } keeps district and country
      const next = { ...values };
      if (values.address) next.address = { ...EMPTY_ADDRESS, ...(company.address ?? {}), ...values.address };

      const changes = this.logs.diff(company, next, TRACKED);
      if (!changes.length) return;

      Object.assign(company, next, { updatedById: ctx.actorId });
      await em.save(company);

      await this.logs.log(
        ctx,
        { action: LogAction.UPDATE, entity: LogEntity.COMPANY, entityId: company.id, summary: "Updated company profile", changes },
        em,
      );
    });

    return this.get();
  }
}