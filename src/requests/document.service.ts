import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, Repository } from "typeorm";
import { RequestDocument } from "./request-docs.entity.js";
import { ServiceRequest } from "./request.entity.js";
import { StorageService } from "../storage/storage.service.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { isClosed } from "./request.types.js";

export const MAX_FILE_MB = 10;
export const MAX_FILES = 10;
export const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// "My Passport (1).PDF" -> "my-passport-1.pdf"
const safeName = (name: string) => {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return `${base || "file"}${ext ? `.${ext}` : ""}`.slice(0, 120);
};

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(RequestDocument) private readonly repo: Repository<RequestDocument>,
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly logs: ActivityLogsService,
  ) {}

  async list(requestId: string) {
    return this.repo
      .createQueryBuilder("document")
      .leftJoin("document.createdBy", "createdBy")
      .addSelect(["createdBy.id", "createdBy.names"])
      .where("document.requestId = :requestId", { requestId })
      .orderBy("document.createdAt", "DESC")
      .getMany();
  }

  // files come from multer (memory): { originalname, mimetype, size, buffer }
  async upload(requestId: string, files: any[], label: string | null | undefined, ctx: AuditContext) {
    if (!files?.length) throw new BadRequestException("Choose at least one file");

    const request = await this.dataSource.getRepository(ServiceRequest).findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException("Request not found");
    if (isClosed(request.status)) throw new BadRequestException("This request is closed: documents can't be added");

    // 1. Upload to storage first
    const uploaded: { file: any; path: string }[] = [];
    try {
      for (const file of files) {
        const path = `requests/${request.id}/${randomUUID()}-${safeName(file.originalname)}`;
        await this.storage.upload(path, file.buffer, file.mimetype);
        uploaded.push({ file, path });
      }
    } catch (err) {
      await this.storage.remove(uploaded.map((u) => u.path)); // don't leave half an upload behind
      throw err;
    }

    // 2. Then save the rows (if this fails, remove the files again)
    try {
      await this.dataSource.transaction(async (em) => {
        for (const { file, path } of uploaded) {
          await em.save(
            em.create(RequestDocument, {
              requestId: request.id,
              label: label ?? null,
              fileName: String(file.originalname).slice(0, 255),
              mimeType: file.mimetype,
              size: file.size,
              storagePath: path,
              createdById: ctx.actorId,
              updatedById: ctx.actorId,
            }),
          );
        }
        await this.logs.log(
          ctx,
          {
            action: LogAction.UPLOAD,
            entity: LogEntity.DOCUMENT,
            entityId: request.id,
            summary: `Uploaded ${uploaded.length} document${uploaded.length > 1 ? "s" : ""} to ${request.reference}${label ? ` (${label})` : ""}: ${uploaded.map((u) => u.file.originalname).join(", ")}`,
          },
          em,
        );
      });
    } catch (err) {
      await this.storage.remove(uploaded.map((u) => u.path));
      throw err;
    }

    return this.list(request.id);
  }

  // Short-lived link to open / download the file (5 minutes)
  async downloadUrl(requestId: string, documentId: string) {
    const doc = await this.repo.findOne({
      where: { id: documentId, requestId },
      select: { id: true, fileName: true, storagePath: true },
    });
    if (!doc) throw new NotFoundException("Document not found");
    return this.storage.signedUrl(doc.storagePath, doc.fileName);
  }

  // Soft delete the row; the file is kept in storage (the history stays complete)
  async remove(requestId: string, documentId: string, ctx: AuditContext) {
    await this.dataSource.transaction(async (em) => {
      const doc = await em.findOne(RequestDocument, { where: { id: documentId, requestId } });
      if (!doc) throw new NotFoundException("Document not found");
      const request = await em.findOne(ServiceRequest, { where: { id: requestId } });

      await em.update(RequestDocument, doc.id, { deletedById: ctx.actorId });
      await em.softDelete(RequestDocument, doc.id);
      await this.logs.log(
        ctx,
        { action: LogAction.DELETE, entity: LogEntity.DOCUMENT, entityId: doc.id, summary: `Removed document "${doc.fileName}" from ${request?.reference ?? "request"}` },
        em,
      );
    });
    return { id: documentId, deleted: true };
  }
}