import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Customer } from "./customers.entity.js";
import { ListCustomersQueryDto, UpdateCustomerDto } from "./customers.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { withPeople } from "../common/audited.entity.js";
import { applyDateRange, isUniqueViolation, likeTerm, paginated } from "../common/query.js";

const TRACKED = ["firstName", "lastName", "email", "phone", "country", "timezone"];

// Per-customer numbers, computed from their requests
const STATS_SQL = `
  SELECT r."customerId",
         COUNT(*)::int AS "requestCount",
         COUNT(*) FILTER (WHERE r.status IN ('pending','in_progress'))::int AS "openCount",
         COALESCE(SUM(r."amountPaid"), 0)::float AS "totalPaid",
         COALESCE(SUM(GREATEST(COALESCE(r."amountDue", 0) - r."amountPaid", 0))
                  FILTER (WHERE r.status IN ('pending','in_progress')), 0)::float AS "balance",
         MAX(r."createdAt") AS "lastRequestAt"
    FROM requests r
   WHERE r."deletedAt" IS NULL
   GROUP BY r."customerId"`;

export interface CustomerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country?: string | null;
  timezone?: string | null;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
  ) {}

  // Used by requests: same email = same customer. Their details are refreshed with the latest form.
  async findOrCreate(em: EntityManager, input: CustomerInput, ctx: AuditContext) {
    const existing = await em
      .createQueryBuilder(Customer, "customer")
      .where("LOWER(customer.email) = LOWER(:email)", { email: input.email })
      .getOne();

    if (existing) {
      const latest: any = {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        ...(input.country ? { country: input.country } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      };
      const changes = this.logs.diff(existing, latest, TRACKED);
      if (changes.length) {
        Object.assign(existing, latest, { updatedById: ctx.actorId });
        await em.save(existing);
        await this.logs.log(
          ctx,
          { action: LogAction.UPDATE, entity: LogEntity.CUSTOMER, entityId: existing.id, summary: `Updated details of ${existing.firstName} ${existing.lastName} from a new request`, changes },
          em,
        );
      }
      return existing;
    }

    const customer = em.create(Customer, {
      ...input,
      email: input.email.toLowerCase(),
      country: input.country ?? null,
      timezone: input.timezone ?? null,
      createdById: ctx.actorId,
      updatedById: ctx.actorId,
    });
    await em.save(customer);
    await this.logs.log(
      ctx,
      { action: LogAction.CREATE, entity: LogEntity.CUSTOMER, entityId: customer.id, summary: `New customer ${customer.firstName} ${customer.lastName} (${customer.email})` },
      em,
    );
    return customer;
  }

  // GET /customers
  async findAll(q: ListCustomersQueryDto) {
    const qb = withPeople(this.repo.createQueryBuilder("customer"), "customer")
      .leftJoin(`(${STATS_SQL})`, "stats", `stats."customerId" = customer.id`)
      .addSelect([
        `COALESCE(stats."requestCount", 0) AS "requestCount"`,
        `COALESCE(stats."openCount", 0) AS "openCount"`,
        `COALESCE(stats."totalPaid", 0) AS "totalPaid"`,
        `COALESCE(stats."balance", 0) AS "balance"`,
        `stats."lastRequestAt" AS "lastRequestAt"`,
      ]);

    if (q.search?.trim()) {
      qb.andWhere(
        `(customer.firstName ILIKE :s OR customer.lastName ILIKE :s OR (customer.firstName || ' ' || customer.lastName) ILIKE :s
          OR customer.email ILIKE :s OR customer.phone ILIKE :s
          OR EXISTS (SELECT 1 FROM requests r WHERE r."customerId" = customer.id AND r.reference ILIKE :s))`,
        { s: likeTerm(q.search) },
      );
    }
    if (q.country?.trim()) qb.andWhere("customer.country ILIKE :country", { country: q.country.trim() });
    if (q.activity === "open") qb.andWhere(`COALESCE(stats."openCount", 0) > 0`);
    if (q.activity === "to_pay") qb.andWhere(`COALESCE(stats."balance", 0) > 0`);
    applyDateRange(qb, "customer.createdAt", q.from, q.to);

    const order = q.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const sortColumn: Record<string, string> = {
      createdAt: "customer.createdAt",
      lastName: "customer.lastName",
      lastRequestAt: `"lastRequestAt"`,
      requestCount: `"requestCount"`,
    };
    qb.orderBy(sortColumn[q.sortBy] ?? "customer.createdAt", order, "NULLS LAST").addOrderBy("customer.id", "DESC");

    const total = await qb.getCount();
    const { entities, raw } = await qb.offset((q.page - 1) * q.limit).limit(q.limit).getRawAndEntities();

    const data = (entities as Customer[]).map((customer: Customer, i: number) => ({
      ...customer,
      requestCount: Number(raw[i]?.requestCount ?? 0),
      openCount: Number(raw[i]?.openCount ?? 0),
      totalPaid: Number(raw[i]?.totalPaid ?? 0),
      balance: Number(raw[i]?.balance ?? 0),
      lastRequestAt: raw[i]?.lastRequestAt ?? null,
    }));

    return paginated(data, total, q.page, q.limit);
  }

  // GET /customers/:id -> customer + their requests (newest first)
  async findOne(id: string) {
    const customer = await withPeople(this.repo.createQueryBuilder("customer"), "customer")
      .leftJoinAndSelect("customer.requests", "request")
      .where("customer.id = :id", { id })
      .orderBy("request.createdAt", "DESC")
      .getOne();
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  // PATCH /customers/:id
  async update(id: string, dto: UpdateCustomerDto, ctx: AuditContext) {
    try {
      await this.dataSource.transaction(async (em) => {
        const customer = await em.findOne(Customer, { where: { id } });
        if (!customer) throw new NotFoundException("Customer not found");

        if (dto.email && dto.email !== customer.email) {
          const taken = await em
            .createQueryBuilder(Customer, "c")
            .where("LOWER(c.email) = LOWER(:email) AND c.id != :id", { email: dto.email, id })
            .getExists();
          if (taken) throw new ConflictException("Another customer already uses this email");
        }

        const changes = this.logs.diff(customer, dto, TRACKED);
        if (!changes.length) return;

        Object.assign(customer, dto, { updatedById: ctx.actorId });
        await em.save(customer);
        await this.logs.log(
          ctx,
          { action: LogAction.UPDATE, entity: LogEntity.CUSTOMER, entityId: customer.id, summary: `Updated customer ${customer.firstName} ${customer.lastName}`, changes },
          em,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("Another customer already uses this email");
      throw err;
    }
    return this.findOne(id);
  }
}