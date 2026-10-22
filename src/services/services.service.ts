import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Service } from "./service.entity.js";
import { CreateServiceDto, ListServicesQueryDto, UpdateServiceDto } from "./service.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { applyDateRange, isUniqueViolation, likeTerm, paginated, slugify } from "../common/query.js";

const TRACKED = ["name", "description", "subDescription", "tags", "isActive"];

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service) private readonly repo: Repository<Service>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
  ) {}

  private withPeople() {
    return this.repo
      .createQueryBuilder("service")
      .leftJoin("service.createdBy", "createdBy")
      .addSelect(["createdBy.id", "createdBy.names", "createdBy.email"])
      .leftJoin("service.updatedBy", "updatedBy")
      .addSelect(["updatedBy.id", "updatedBy.names", "updatedBy.email"]);
  }

  async findAll(q: ListServicesQueryDto) {
    const qb = this.withPeople();

    if (q.search?.trim()) {
      qb.andWhere(
        `(service.name ILIKE :s OR service.description ILIKE :s OR service.subDescription ILIKE :s
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(service.tags) t WHERE t ILIKE :s))`,
        { s: likeTerm(q.search) },
      );
    }
    if (q.tag?.trim()) {
      qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements_text(service.tags) t WHERE LOWER(t) = LOWER(:tag))", {
        tag: q.tag.trim(),
      });
    }
    if (q.isActive !== undefined) qb.andWhere("service.isActive = :isActive", { isActive: q.isActive });
    applyDateRange(qb, "service.createdAt", q.from, q.to);

    const order = q.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const [data, total] = await qb
      .orderBy(`service.${q.sortBy}`, order)
      .addOrderBy("service.id", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return paginated(data, total, q.page, q.limit);
  }

  // GET /services/tags -> every tag in use (for the filter dropdown), with how many services use it
  async tags() {
    return this.dataSource.query(
      `SELECT MIN(t) AS tag, COUNT(*)::int AS count
         FROM services s, jsonb_array_elements_text(s.tags) t
        WHERE s."deletedAt" IS NULL
        GROUP BY LOWER(t)
        ORDER BY MIN(t)`,
    );
  }

  async findOne(id: string) {
    const service = await this.withPeople().where("service.id = :id", { id }).getOne();
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  async create(dto: CreateServiceDto, ctx: AuditContext) {
    const id = await this.write(async (em) => {
      const slug = this.slugOrFail(dto.name);
      await this.assertNameFree(em, slug);

      const service = em.create(Service, {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        subDescription: dto.subDescription ?? null,
        tags: dto.tags ?? [],
        isActive: dto.isActive ?? true,
        createdById: ctx.actorId,
        updatedById: ctx.actorId,
      });
      await em.save(service);

      await this.logs.log(
        ctx,
        { action: LogAction.CREATE, entity: LogEntity.SERVICE, entityId: service.id, summary: `Created service ${service.name}` },
        em,
      );
      return service.id;
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateServiceDto, ctx: AuditContext) {
    await this.write(async (em) => {
      const service = await this.findEntity(em, id);

      const patch: any = { ...dto };
      if (dto.name !== undefined) {
        patch.slug = this.slugOrFail(dto.name);
        if (patch.slug !== service.slug) await this.assertNameFree(em, patch.slug, service.id);
      }

      const changes = this.logs.diff(service, dto, TRACKED);
      if (!changes.length) return;

      Object.assign(service, patch, { updatedById: ctx.actorId });
      await em.save(service);

      const statusOnly = changes.length === 1 && changes[0].field === "isActive";
      await this.logs.log(
        ctx,
        {
          action: statusOnly ? LogAction.STATUS : LogAction.UPDATE,
          entity: LogEntity.SERVICE,
          entityId: service.id,
          summary: statusOnly
            ? `${service.isActive ? "Activated" : "Deactivated"} service ${service.name}`
            : `Updated service ${service.name}`,
          changes,
        },
        em,
      );
    });

    return this.findOne(id);
  }

  async remove(id: string, ctx: AuditContext) {
    await this.write(async (em) => {
      const service = await this.findEntity(em, id);

      await em.update(Service, service.id, { deletedById: ctx.actorId });
      await em.softDelete(Service, service.id);

      await this.logs.log(
        ctx,
        { action: LogAction.DELETE, entity: LogEntity.SERVICE, entityId: service.id, summary: `Deleted service ${service.name}` },
        em,
      );
    });

    return { id, deleted: true };
  }

  // ---------- Helpers ----------

  private async write<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("A service with this name already exists");
      throw err;
    }
  }

  private async findEntity(em: EntityManager, id: string) {
    const service = await em.findOne(Service, { where: { id } });
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  private slugOrFail(name: string) {
    const slug = slugify(name);
    if (!slug) throw new ConflictException("The name must contain letters or numbers");
    return slug;
  }

  private async assertNameFree(em: EntityManager, slug: string, exceptId?: string) {
    const qb = em.createQueryBuilder(Service, "service").where("service.slug = :slug", { slug });
    if (exceptId) qb.andWhere("service.id != :exceptId", { exceptId });
    const existing = await qb.getOne();
    if (existing) throw new ConflictException(`A service named "${existing.name}" already exists`);
  }
}