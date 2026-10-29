import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { CompanyProfile } from "./company.entity.js";
import { UpdateCompanyProfileDto, UpsertCompanyProfileDto } from "./company.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { StorageService } from "../storage/storage.service.js";

const TRACKED = ["name", "about", "logoUrl", "phone", "email", "websiteUrl", "linkedinUrl", "address"];
const EMPTY_ADDRESS = { district: null, city: null, country: null };

const LOGO_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyProfile) private readonly repo: Repository<CompanyProfile>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
    private readonly storage: StorageService,
  ) {}

  async get() {
    return this.repo
      .createQueryBuilder("company")
      .leftJoin("company.updatedBy", "updatedBy")
      .addSelect(["updatedBy.id", "updatedBy.names", "updatedBy.email"])
      .getOne();
  }

  async upsert(dto: UpsertCompanyProfileDto, ctx: AuditContext) {
    const current = await this.repo.findOne({ where: {} });
    const full = {
      name: dto.name,
      about: dto.about ?? null,
      phone: dto.phone ?? null,
      logoUrl: dto.logoUrl !== undefined ? dto.logoUrl : (current?.logoUrl ?? null),
      email: dto.email ?? null,
      websiteUrl: dto.websiteUrl ?? null,
      linkedinUrl: dto.linkedinUrl ?? null,
      address: { ...EMPTY_ADDRESS, ...(dto.address ?? {}) },
    };
    return this.save(full, ctx, true);
  }

  async update(dto: UpdateCompanyProfileDto, ctx: AuditContext) {
    return this.save(dto, ctx, false);
  }

  // POST /company-profile/logo -> stored in the PUBLIC bucket 
  async uploadLogo(file: any, ctx: AuditContext) {
    if (!file) throw new BadRequestException("Choose an image");
    const company = await this.repo.findOne({ where: {} });
    if (!company) throw new BadRequestException("Save the company name first, then add the logo");
 
    const ext = LOGO_EXT[file.mimetype] ?? "png";
    const url = await this.storage.uploadPublic(`company/logo-${Date.now()}.${ext}`, file.buffer, file.mimetype);
    const oldUrl = company.logoUrl;
 
    await this.save({ logoUrl: url }, ctx, false);
    if (oldUrl) await this.storage.removePublicUrl(oldUrl); 
    return this.get();
  }
 
  // DELETE /company-profile/logo
  async removeLogo(ctx: AuditContext) {
    const company = await this.repo.findOne({ where: {} });
    if (!company?.logoUrl) return this.get();
    const oldUrl = company.logoUrl;
    await this.save({ logoUrl: null }, ctx, false);
    await this.storage.removePublicUrl(oldUrl);
    return this.get();
  }

  private async save(values: any, ctx: AuditContext, createIfMissing: boolean) {
    await this.dataSource.transaction(async (em) => {
      let company = await em.findOne(CompanyProfile, { where: {} });

      if (!company) {
        if (!createIfMissing) throw new NotFoundException("Company profile not set yet.");

        company = em.create(CompanyProfile, { ...values, updatedById: ctx.actorId });
        await em.save(company);
        await this.logs.log(ctx, { action: LogAction.CREATE, entity: LogEntity.COMPANY, entityId: company.id, summary: `Created company profile "${company.name}"` }, em);
        return;
      }

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