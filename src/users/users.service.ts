import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { User, UserRole, UserStatus } from "./user.entity.js";
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from "./user.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { applyDateRange, isUniqueViolation, likeTerm, paginated } from "../common/query.js";


const TRACKED = ["names", "email", "phoneNumber", "role", "status"];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
  ) {}


  private withPeople() {
    return this.repo
      .createQueryBuilder("user")
      .leftJoin("user.createdBy", "createdBy")
      .addSelect(["createdBy.id", "createdBy.names", "createdBy.email"])
      .leftJoin("user.updatedBy", "updatedBy")
      .addSelect(["updatedBy.id", "updatedBy.names", "updatedBy.email"]);
  }

  async findAll(q: ListUsersQueryDto) {
    const qb = this.withPeople();

    if (q.search?.trim()) {
      qb.andWhere("(user.names ILIKE :s OR user.email ILIKE :s OR user.phoneNumber ILIKE :s)", { s: likeTerm(q.search) });
    }
    if (q.role) qb.andWhere("user.role = :role", { role: q.role });
    if (q.status) qb.andWhere("user.status = :status", { status: q.status });
    applyDateRange(qb, "user.createdAt", q.from, q.to);

    const order = q.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const [data, total] = await qb
      .orderBy(`user.${q.sortBy}`, order)
      .addOrderBy("user.id", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return paginated(data, total, q.page, q.limit);
  }

  async stats() {
    const [byStatus, byRole] = await Promise.all([
      this.repo.createQueryBuilder("user").select("user.status", "key").addSelect("COUNT(*)::int", "count").groupBy("user.status").getRawMany(),
      this.repo.createQueryBuilder("user").select("user.role", "key").addSelect("COUNT(*)::int", "count").groupBy("user.role").getRawMany(),
    ]);

    const status: Record<string, number> = Object.fromEntries(Object.values(UserStatus).map((s) => [s, 0]));
    const role: Record<string, number> = Object.fromEntries(Object.values(UserRole).map((r) => [r, 0]));
    for (const r of byStatus) status[r.key] = r.count;
    for (const r of byRole) role[r.key] = r.count;

    return { total: Object.values(status).reduce((a, b) => a + b, 0), status, role };
  }

  async findOne(id: string) {
    const user = await this.withPeople().where("user.id = :id", { id }).getOne();
    if (!user) throw new NotFoundException("User not found");
    return user;
  }


  async create(dto: CreateUserDto, ctx: AuditContext) {
    this.assertCanGiveRole(ctx, dto.role);

    const id = await this.write(async (em) => {
      await this.assertUnique(em, dto.email, dto.phoneNumber);

      const user = em.create(User, {
        ...dto,
        role: dto.role ?? UserRole.STAFF,
        status: dto.status ?? UserStatus.ACTIVE,
        createdById: ctx.actorId,
        updatedById: ctx.actorId,
      });
      await em.save(user);

      await this.logs.log(
        ctx,
        { action: LogAction.CREATE, entity: LogEntity.USER, entityId: user.id, summary: `Created user ${user.names} (${user.role})` },
        em,
      );
      return user.id;
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateUserDto, ctx: AuditContext) {
    await this.write(async (em) => {
      const user = await this.findEntity(em, id);

      if (user.role === UserRole.DEV || dto.role === UserRole.DEV) this.assertCanGiveRole(ctx, UserRole.DEV);
      if (dto.status === UserStatus.INACTIVE) await this.assertCanDeactivate(em, user, ctx);
      if (dto.role && dto.role !== UserRole.DEV && user.role === UserRole.DEV) await this.assertNotLastDev(em, user);

      if (dto.email || dto.phoneNumber) {
        await this.assertUnique(em, dto.email ?? user.email, dto.phoneNumber ?? user.phoneNumber, user.id);
      }

      const changes = this.logs.diff(user, dto, TRACKED);
      if (!changes.length) return; 

      Object.assign(user, dto, { updatedById: ctx.actorId });
      await em.save(user);

      await this.logs.log(
        ctx,
        { action: LogAction.UPDATE, entity: LogEntity.USER, entityId: user.id, summary: `Updated user ${user.names}`, changes },
        em,
      );
    });

    return this.findOne(id);
  }

  async setStatus(id: string, status: UserStatus, ctx: AuditContext) {
    await this.write(async (em) => {
      const user = await this.findEntity(em, id);
      if (user.status === status) return;

      if (user.role === UserRole.DEV) this.assertCanGiveRole(ctx, UserRole.DEV);
      if (status === UserStatus.INACTIVE) await this.assertCanDeactivate(em, user, ctx);

      const from = user.status;
      user.status = status;
      user.updatedById = ctx.actorId;
      await em.save(user);

      await this.logs.log(
        ctx,
        {
          action: LogAction.STATUS,
          entity: LogEntity.USER,
          entityId: user.id,
          summary: `${status === UserStatus.ACTIVE ? "Activated" : "Deactivated"} user ${user.names}`,
          changes: [{ field: "status", from, to: status }],
        },
        em,
      );
    });

    return this.findOne(id);
  }


  async remove(id: string, ctx: AuditContext) {
    await this.write(async (em) => {
      const user = await this.findEntity(em, id);

      if (ctx.actorId && ctx.actorId === user.id) throw new BadRequestException("You can't delete your own account");
      if (user.role === UserRole.DEV) {
        this.assertCanGiveRole(ctx, UserRole.DEV);
        await this.assertNotLastDev(em, user);
      }

      await em.update(User, user.id, { deletedById: ctx.actorId });
      await em.softDelete(User, user.id);

      await this.logs.log(
        ctx,
        { action: LogAction.DELETE, entity: LogEntity.USER, entityId: user.id, summary: `Deleted user ${user.names} (${user.email})` },
        em,
      );
    });

    return { id, deleted: true };
  }

  // ---------- Helpers ----------

  // Run in one transaction; turn a duplicate that slipped through into a clean 409
  private async write<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("A user with this email or phone number already exists");
      throw err;
    }
  }

  // Plain row (no relations) so save() only writes our columns
  private async findEntity(em: EntityManager, id: string) {
    const user = await em.findOne(User, { where: { id } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  private async assertUnique(em: EntityManager, email: string, phoneNumber: string, exceptId?: string) {
    const qb = em
      .createQueryBuilder(User, "user")
      .where("(LOWER(user.email) = LOWER(:email) OR user.phoneNumber = :phoneNumber)", { email, phoneNumber });
    if (exceptId) qb.andWhere("user.id != :exceptId", { exceptId });

    const existing = await qb.getOne();
    if (!existing) return;
    if (existing.email.toLowerCase() === email.toLowerCase()) throw new ConflictException("This email is already used by another user");
    throw new ConflictException("This phone number is already used by another user");
  }

  // Only a dev can create / change / remove a dev. (No actor yet = before login exists -> allowed)
  private assertCanGiveRole(ctx: AuditContext, role?: UserRole) {
    if (role === UserRole.DEV && ctx.actorRole && ctx.actorRole !== UserRole.DEV) {
      throw new ForbiddenException("Only a dev can manage dev accounts");
    }
  }

  private async assertCanDeactivate(em: EntityManager, user: User, ctx: AuditContext) {
    if (ctx.actorId && ctx.actorId === user.id) throw new BadRequestException("You can't deactivate your own account");
    if (user.role === UserRole.DEV) await this.assertNotLastDev(em, user);
  }

  // Never leave the system without an active dev
  private async assertNotLastDev(em: EntityManager, user: User) {
    const others = await em
      .createQueryBuilder(User, "user")
      .where("user.role = :dev AND user.status = :active AND user.id != :id", { dev: UserRole.DEV, active: UserStatus.ACTIVE, id: user.id })
      .getCount();
    if (!others) throw new BadRequestException("This is the last active dev account");
  }
}