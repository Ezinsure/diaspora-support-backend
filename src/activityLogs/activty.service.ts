import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ActivityLog } from './activity.entity.js';
import { AuditContext, LogAction, LogInput } from './activity.type.js';
import { ListLogsQueryDto } from './activity.query.js';

const TZ = 'Africa/Kigali';

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
  ) {}

  async log(
    ctx: AuditContext,
    input: LogInput,
    manager?: EntityManager,
  ): Promise<void> {
    if (
      input.action === LogAction.UPDATE &&
      input.changes &&
      input.changes.length === 0
    )
      return;

    try {
      const repo = manager ? manager.getRepository(ActivityLog) : this.repo;
      await repo.insert({
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 255) ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 255),
        changes: input.changes?.length ? (input.changes as any) : null,
      });
    } catch (err) {
      if (manager) throw err;
      this.logger.error('Failed to write activity log', err as any);
    }
  }

  async findAll(q: ListLogsQueryDto) {
    if (q.from && q.to && q.from > q.to)
      throw new BadRequestException("'from' must be before 'to'");

    const qb = this.repo.createQueryBuilder('log');

    if (q.search?.trim()) {
      const search = `%${q.search.trim().replace(/[\\%_]/g, '\\$&')}%`;
      qb.andWhere(
        '(log.summary ILIKE :search OR log.actorName ILIKE :search OR log.entityId ILIKE :search)',
        { search },
      );
    }
    if (q.action) qb.andWhere('log.action = :action', { action: q.action });
    if (q.entity) qb.andWhere('log.entity = :entity', { entity: q.entity });
    if (q.entityId)
      qb.andWhere('log.entityId = :entityId', { entityId: q.entityId });
    if (q.actorId)
      qb.andWhere('log.actorId = :actorId', { actorId: q.actorId });
    if (q.from)
      qb.andWhere(
        'log.createdAt >= (CAST(:from AS date)::timestamp AT TIME ZONE :tz)',
        { from: q.from, tz: TZ },
      );
    if (q.to)
      qb.andWhere(
        'log.createdAt < ((CAST(:to AS date) + 1)::timestamp AT TIME ZONE :tz)',
        { to: q.to, tz: TZ },
      );

    const [data, total] = await qb
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return {
      data,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.ceil(total / q.limit),
    };
  }

  async findOne(id: string) {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) throw new NotFoundException('Log not found');
    return log;
  }

  diff(
    before: Record<string, any>,
    after: Record<string, any>,
    fields: string[],
  ) {
    return fields
      .filter(
        (f) =>
          after[f] !== undefined &&
          JSON.stringify(before[f] ?? null) !==
            JSON.stringify(after[f] ?? null),
      )
      .map((f) => ({
        field: f,
        from: before[f] ?? null,
        to: after[f] ?? null,
      }));
  }
}
