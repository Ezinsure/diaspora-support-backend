import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { Faq } from "./faqs.entity.js";
import { CreateFaqDto, ListFaqsQueryDto, UpdateFaqDto } from "./faqs.dto.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { withPeople } from "../common/audited.entity.js";
import { applyDateRange, isUniqueViolation, likeTerm, paginated, slugify } from "../common/query.js";

const TRACKED = ["question", "answer", "isPublished"];
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

@Injectable()
export class FaqsService {
  constructor(
    @InjectRepository(Faq) private readonly repo: Repository<Faq>,
    private readonly dataSource: DataSource,
    private readonly logs: ActivityLogsService,
  ) {}

  async findAll(q: ListFaqsQueryDto) {
    const qb = withPeople(this.repo.createQueryBuilder("faq"), "faq");

    if (q.search?.trim()) qb.andWhere("(faq.question ILIKE :s OR faq.answer ILIKE :s)", { s: likeTerm(q.search) });
    if (q.isPublished !== undefined) qb.andWhere("faq.isPublished = :p", { p: q.isPublished });
    applyDateRange(qb, "faq.createdAt", q.from, q.to);

    const order = q.order?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    const [data, total] = await qb
      .orderBy(`faq.${q.sortBy}`, order)
      .addOrderBy("faq.createdAt", "ASC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return paginated(data, total, q.page, q.limit);
  }

  async findPublished() {
    return this.repo.find({
      where: { isPublished: true },
      select: { id: true, question: true, answer: true, sortOrder: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async findOne(id: string) {
    const faq = await withPeople(this.repo.createQueryBuilder("faq"), "faq").where("faq.id = :id", { id }).getOne();
    if (!faq) throw new NotFoundException("FAQ not found");
    return faq;
  }

  async create(dto: CreateFaqDto, ctx: AuditContext) {
    const id = await this.write(async (em) => {
      const slug = this.slugOrFail(dto.question);
      await this.assertQuestionFree(em, slug);

      // New questions go to the end of the list
      const { max } = await em.createQueryBuilder(Faq, "faq").select("COALESCE(MAX(faq.sortOrder), -1)", "max").getRawOne();

      const faq = em.create(Faq, {
        ...dto,
        slug,
        sortOrder: Number(max) + 1,
        isPublished: dto.isPublished ?? true,
        createdById: ctx.actorId,
        updatedById: ctx.actorId,
      });
      await em.save(faq);

      await this.logs.log(ctx, { action: LogAction.CREATE, entity: LogEntity.FAQ, entityId: faq.id, summary: `Added FAQ "${short(faq.question)}"` }, em);
      return faq.id;
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateFaqDto, ctx: AuditContext) {
    await this.write(async (em) => {
      const faq = await this.findEntity(em, id);

      const patch: any = { ...dto };
      if (dto.question !== undefined) {
        patch.slug = this.slugOrFail(dto.question);
        if (patch.slug !== faq.slug) await this.assertQuestionFree(em, patch.slug, faq.id);
      }

      const changes = this.logs.diff(faq, dto, TRACKED);
      if (!changes.length) return;

      Object.assign(faq, patch, { updatedById: ctx.actorId });
      await em.save(faq);

      const publishOnly = changes.length === 1 && changes[0].field === "isPublished";
      await this.logs.log(
        ctx,
        {
          action: publishOnly ? LogAction.STATUS : LogAction.UPDATE,
          entity: LogEntity.FAQ,
          entityId: faq.id,
          summary: publishOnly
            ? `${faq.isPublished ? "Published" : "Hid"} FAQ "${short(faq.question)}"`
            : `Updated FAQ "${short(faq.question)}"`,
          changes,
        },
        em,
      );
    });

    return this.findOne(id);
  }

  async reorder(ids: string[], ctx: AuditContext) {
    if (new Set(ids).size !== ids.length) throw new BadRequestException("The list has the same FAQ twice");

    await this.write(async (em) => {
      const found = await em.count(Faq, { where: { id: In(ids) } });
      if (found !== ids.length) throw new BadRequestException("Some FAQs in the list don't exist");

      for (const [index, id] of ids.entries()) {
        await em.update(Faq, id, { sortOrder: index, updatedById: ctx.actorId });
      }

      await this.logs.log(ctx, { action: LogAction.REORDER, entity: LogEntity.FAQ, summary: `Reordered ${ids.length} FAQs` }, em);
    });

    return this.findAll(Object.assign(new ListFaqsQueryDto(), { limit: 100 }));
  }

  async remove(id: string, ctx: AuditContext) {
    await this.write(async (em) => {
      const faq = await this.findEntity(em, id);
      await em.update(Faq, faq.id, { deletedById: ctx.actorId });
      await em.softDelete(Faq, faq.id);
      await this.logs.log(ctx, { action: LogAction.DELETE, entity: LogEntity.FAQ, entityId: faq.id, summary: `Deleted FAQ "${short(faq.question)}"` }, em);
    });
    return { id, deleted: true };
  }

  // ---------- Helpers ----------

  private async write<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("This question already exists");
      throw err;
    }
  }

  private async findEntity(em: EntityManager, id: string) {
    const faq = await em.findOne(Faq, { where: { id } });
    if (!faq) throw new NotFoundException("FAQ not found");
    return faq;
  }

  private slugOrFail(question: string) {
    const slug = slugify(question);
    if (!slug) throw new BadRequestException("The question must contain letters or numbers");
    return slug.slice(0, 320);
  }

  private async assertQuestionFree(em: EntityManager, slug: string, exceptId?: string) {
    const qb = em.createQueryBuilder(Faq, "faq").where("faq.slug = :slug", { slug });
    if (exceptId) qb.andWhere("faq.id != :exceptId", { exceptId });
    if (await qb.getExists()) throw new ConflictException("This question already exists");
  }
}