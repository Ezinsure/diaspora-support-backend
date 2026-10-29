import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { RequestsService } from "./requests.service.js";
import { ALLOWED_TYPES, DocumentsService, MAX_FILE_MB, MAX_FILES } from "./document.service.js";
import { RequestSource } from "./request.types.js";
import { auditContext } from "../common/audit-context.js";
import {
  CreateRequestDto,
  ListRequestsQueryDto,
  RecordPaymentDto,
  RequestStatsQueryDto,
  SaveProformaDto,
  UpdateRequestDto,
  UpdateRequestStatusDto,
  UploadDocumentsDto,
  VoidPaymentDto,
} from "./request.dto.js";
import { PaymentsService } from "./payment.service.js";

const ID = new ParseUUIDPipe();

// Admin side (all processing). Will be protected by login.
@Controller("requests")
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly payments: PaymentsService,
    private readonly documents: DocumentsService,
  ) {}

  // ---------- Requests ----------

  // GET /requests?search=&status=&serviceId=&customerId=&payment=unpaid|partial|paid&from=&to=&sortBy=&order=&page=&limit=
  @Get()
  findAll(@Query() query: ListRequestsQueryDto) {
    return this.requests.findAll(query);
  }

  // GET /requests/stats?from=2026-10-23&to=2026-10-23
  @Get("stats")
  stats(@Query() query: RequestStatsQueryDto) {
    return this.requests.stats(query);
  }

  @Get(":id")
  findOne(@Param("id", ID) id: string) {
    return this.requests.findOne(id);
  }

  // Staff creates a request for a customer who called / wrote
  @Post()
  create(@Body() dto: CreateRequestDto, @Req() req: any) {
    return this.requests.create(dto, auditContext(req), RequestSource.ADMIN);
  }

  @Patch(":id")
  update(@Param("id", ID) id: string, @Body() dto: UpdateRequestDto, @Req() req: any) {
    return this.requests.update(id, dto, auditContext(req));
  }

  // { "status": "completed" } / { "status": "cancelled", "note": "Customer changed their mind" }
  @Patch(":id/status")
  setStatus(@Param("id", ID) id: string, @Body() dto: UpdateRequestStatusDto, @Req() req: any) {
    return this.requests.setStatus(id, dto.status, dto.note, auditContext(req), dto.notifyCustomer !== false);
  }

  @Delete(":id")
  remove(@Param("id", ID) id: string, @Req() req: any) {
    return this.requests.remove(id, auditContext(req));
  }

  // ---------- Proforma ----------

  // Create or replace. { items: [{ description, quantity, unitPrice }], currency?, validUntil?, note?, send? }
  @Put(":id/proforma")
  saveProforma(@Param("id", ID) id: string, @Body() dto: SaveProformaDto, @Req() req: any) {
    return this.requests.saveProforma(id, dto, auditContext(req));
  }

  @Post(":id/proforma/send")
  sendProforma(@Param("id", ID) id: string, @Req() req: any) {
    return this.requests.sendProforma(id, auditContext(req));
  }

  @Delete(":id/proforma")
  removeProforma(@Param("id", ID) id: string, @Req() req: any) {
    return this.requests.removeProforma(id, auditContext(req));
  }

  // ---------- Documents ----------

  @Get(":id/documents")
  listDocuments(@Param("id", ID) id: string) {
    return this.documents.list(id);
  }

  // multipart/form-data: files (1-10), label (optional)
  @Post(":id/documents")
  @UseInterceptors(
    FilesInterceptor("files", MAX_FILES, {
      limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
      fileFilter: (_req: any, file: any, cb: any) =>
        ALLOWED_TYPES.includes(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException(`"${file.originalname}" is not allowed. Use PDF, JPG, PNG, WEBP or Word.`), false),
    }),
  )
  uploadDocuments(@Param("id", ID) id: string, @UploadedFiles() files: any[], @Body() dto: UploadDocumentsDto, @Req() req: any) {
    return this.documents.upload(id, files, dto.label, auditContext(req));
  }

  // -> { url, expiresIn } (link valid 5 minutes)
  @Get(":id/documents/:documentId/url")
  documentUrl(@Param("id", ID) id: string, @Param("documentId", ID) documentId: string) {
    return this.documents.downloadUrl(id, documentId);
  }

  @Delete(":id/documents/:documentId")
  removeDocument(@Param("id", ID) id: string, @Param("documentId", ID) documentId: string, @Req() req: any) {
    return this.documents.remove(id, documentId, auditContext(req));
  }

  // ---------- Payments ----------

  @Get(":id/payments")
  listPayments(@Param("id", ID) id: string) {
    return this.payments.list(id);
  }

  // { amount, method, transactionRef?, payerPhone?, paidAt?, note?, sendReceipt? }
  @Post(":id/payments")
  recordPayment(@Param("id", ID) id: string, @Body() dto: RecordPaymentDto, @Req() req: any) {
    return this.payments.record(id, dto, auditContext(req));
  }

  @Post(":id/payments/:paymentId/send-receipt")
  sendReceipt(@Param("id", ID) id: string, @Param("paymentId", ID) paymentId: string, @Req() req: any) {
    return this.payments.sendReceipt(id, paymentId, auditContext(req));
  }

  // { "reason": "Recorded twice" }
  @Delete(":id/payments/:paymentId")
  voidPayment(@Param("id", ID) id: string, @Param("paymentId", ID) paymentId: string, @Body() dto: VoidPaymentDto, @Req() req: any) {
    return this.payments.void(id, paymentId, dto.reason, auditContext(req));
  }
}