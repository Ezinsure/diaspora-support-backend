import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { ServiceFee } from "./fees.entity.js";
import { Service } from "../services/service.entity.js";
import { CreateServiceFeeDto, ListServiceFeesQueryDto, UpdateServiceFeeDto } from "./fees.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { withPeople } from "../common/audited.entity.js";
import { applyDateRange, isUniqueViolation, likeTerm, paginated, slugify } from "../common/query.js";

const TRACKED = ["serviceId", "name", "amount", "currency", "description", "isActive"];
const money = (amount: number, currency: string) => `${currency} ${Number(amount).toLocaleString("en-US")}`;
const label = (name: string, serviceName?: string | null) => (serviceName ? `"${name}" (${serviceName})` : `"${name}" (general)`);

@Injectable()
export class ServiceFeesService {
  constructor(
    @InjectRepository(ServiceFee) private readonly repo: Repository<ServiceFee>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
  ) {}


  private query() {
    return withPeople(this.repo.createQueryBuilder("fee"), "fee")
      .leftJoin("fee.service", "service")
      .addSelect(["service.id", "service.name", "service.isActive"]);
  }

  async findAll(q: ListServiceFeesQueryDto) {
    if (q.minAmount !== undefined && q.maxAmount !== undefined && q.minAmount > q.maxAmount) {
      throw new BadRequestException("minAmount must be less than maxAmount");
    }

    const qb = this.query();

    if (q.search?.trim()) {
      qb.andWhere("(fee.name ILIKE :s OR fee.description ILIKE :s OR service.name ILIKE :s)", { s: likeTerm(q.search) });
    }
    if (q.serviceId === "none") qb.andWhere("fee.serviceId IS NULL");
    else if (q.serviceId) qb.andWhere("fee.serviceId = :serviceId", { serviceId: q.serviceId });
    if (q.currency) qb.andWhere("fee.currency = :currency", { currency: q.currency });
    if (q.isActive !== undefined) qb.andWhere("fee.isActive = :isActive", { isActive: q.isActive });
    if (q.minAmount !== undefined) qb.andWhere("fee.amount >= :min", { min: q.minAmount });
    if (q.maxAmount !== undefined) qb.andWhere("fee.amount <= :max", { max: q.maxAmount });
    applyDateRange(qb, "fee.createdAt", q.from, q.to);

    const order = q.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const [data, total] = await qb
      .orderBy(`fee.${q.sortBy}`, order)
      .addOrderBy("fee.id", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return paginated(data, total, q.page, q.limit);
  }

  // Website / request form: active fees. General fees first, then per active service.
  async findPublic(serviceId?: string) {
    const qb = this.repo
      .createQueryBuilder("fee")
      .leftJoin("fee.service", "service")
      .addSelect(["service.id", "service.name"])
      .where("fee.isActive = true")
      .andWhere("(fee.serviceId IS NULL OR service.isActive = true)");

    // For one service: its fees + the general ones
    if (serviceId) qb.andWhere("(fee.serviceId = :serviceId OR fee.serviceId IS NULL)", { serviceId });

    const fees = await qb.orderBy("service.name", "ASC", "NULLS FIRST").addOrderBy("fee.amount", "ASC").getMany();

    const groups = new Map<string, any>();
    for (const f of fees) {
      const key = f.serviceId ?? "general";
      const g = groups.get(key) ?? { serviceId: f.serviceId, serviceName: f.service?.name ?? null, fees: [] };
      g.fees.push({ id: f.id, name: f.name, amount: f.amount, currency: f.currency, description: f.description });
      groups.set(key, g);
    }
    return [...groups.values()];
  }

  async findOne(id: string) {
    const fee = await this.query().where("fee.id = :id", { id }).getOne();
    if (!fee) throw new NotFoundException("Service fee not found");
    return fee;
  }


  async create(dto: CreateServiceFeeDto, ctx: AuditContext) {
    const id = await this.write(async (em) => {
      const service = dto.serviceId ? await this.findService(em, dto.serviceId) : null;

      const slug = this.slugOrFail(dto.name);
      await this.assertNameFree(em, service?.id ?? null, slug);

      const fee = em.create(ServiceFee, {
        serviceId: service?.id ?? null,
        name: dto.name,
        slug,
        amount: dto.amount,
        currency: dto.currency ?? "USD",
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        createdById: ctx.actorId,
        updatedById: ctx.actorId,
      });
      await em.save(fee);

      await this.logs.log(
        ctx,
        {
          action: LogAction.CREATE,
          entity: LogEntity.SERVICE_FEE,
          entityId: fee.id,
          summary: `Added fee ${label(fee.name, service?.name)} — ${money(fee.amount, fee.currency)}`,
        },
        em,
      );
      return fee.id;
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateServiceFeeDto, ctx: AuditContext) {
    await this.write(async (em) => {
      const fee = await em.findOne(ServiceFee, { where: { id } });
      if (!fee) throw new NotFoundException("Service fee not found");

      const patch: any = { ...dto };

      // Link / change / unlink the service
      let serviceName: string | null = null;
      if (dto.serviceId !== undefined) {
        const service = dto.serviceId ? await this.findService(em, dto.serviceId) : null;
        patch.serviceId = service?.id ?? null;
        serviceName = service?.name ?? null;
      } else if (fee.serviceId) {
        serviceName = (await em.findOne(Service, { where: { id: fee.serviceId }, withDeleted: true }))?.name ?? null;
      }

      // Duplicate check when the name or the service changes
      const nextServiceId = patch.serviceId !== undefined ? patch.serviceId : fee.serviceId;
      const nextSlug = dto.name !== undefined ? this.slugOrFail(dto.name) : fee.slug;
      if (nextSlug !== fee.slug || nextServiceId !== fee.serviceId) await this.assertNameFree(em, nextServiceId, nextSlug, fee.id);
      patch.slug = nextSlug;

      const changes = this.logs.diff(fee, patch, TRACKED);
      if (!changes.length) return;

      Object.assign(fee, patch, { updatedById: ctx.actorId });
      await em.save(fee);

      const priceChange = changes.find((c) => c.field === "amount");
      const linkChange = changes.find((c) => c.field === "serviceId");
      await this.logs.log(
        ctx,
        {
          action: LogAction.UPDATE,
          entity: LogEntity.SERVICE_FEE,
          entityId: fee.id,
          summary: priceChange
            ? `Changed ${label(fee.name, serviceName)} from ${money(priceChange.from, fee.currency)} to ${money(priceChange.to, fee.currency)}`
            : linkChange
              ? serviceName
                ? `Linked fee "${fee.name}" to ${serviceName}`
                : `Made fee "${fee.name}" a general fee`
              : `Updated fee ${label(fee.name, serviceName)}`,
          changes,
        },
        em,
      );
    });

    return this.findOne(id);
  }

  async remove(id: string, ctx: AuditContext) {
    await this.write(async (em) => {
      const fee = await em.findOne(ServiceFee, { where: { id }, relations: { service: true } });
      if (!fee) throw new NotFoundException("Service fee not found");

      await em.update(ServiceFee, fee.id, { deletedById: ctx.actorId });
      await em.softDelete(ServiceFee, fee.id);

      await this.logs.log(
        ctx,
        { action: LogAction.DELETE, entity: LogEntity.SERVICE_FEE, entityId: fee.id, summary: `Deleted fee ${label(fee.name, fee.service?.name)}` },
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
      if (isUniqueViolation(err)) throw new ConflictException("A fee with this name already exists");
      throw err;
    }
  }

  private async findService(em: EntityManager, id: string) {
    const service = await em.findOne(Service, { where: { id } });
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  private slugOrFail(name: string) {
    const slug = slugify(name);
    if (!slug) throw new BadRequestException("The fee name must contain letters or numbers");
    return slug;
  }

  // Same name not allowed twice for one service, nor twice among general fees
  private async assertNameFree(em: EntityManager, serviceId: string | null, slug: string, exceptId?: string) {
    const qb = em.createQueryBuilder(ServiceFee, "fee").where("fee.slug = :slug", { slug });
    if (serviceId) qb.andWhere("fee.serviceId = :serviceId", { serviceId });
    else qb.andWhere("fee.serviceId IS NULL");
    if (exceptId) qb.andWhere("fee.id != :exceptId", { exceptId });

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        serviceId ? `This service already has a fee named "${existing.name}"` : `A general fee named "${existing.name}" already exists`,
      );
    }
  }
}