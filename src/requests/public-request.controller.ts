import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { RequestsService } from "./requests.service.js";
import { PublicAccessService } from "./public-access.service.js";
import { RequestSource } from "./request.types.js";
import { auditContext, clientIp } from "../common/audit-context.js";
import { PublicUploadDocumentsDto, RequestAccessCodeDto, SubmitRequestDto, TrackRequestDto, VerifyAccessCodeDto } from "./request.dto.js";
import { Public } from "../auth/decorators/auth.decorators.js";
import { ALLOWED_TYPES, DocumentsService, MAX_FILE_MB, MAX_FILES } from "./document.service.js";
import { FilesInterceptor } from "@nestjs/platform-express";
import { RequestNotificationsService } from "./request-notifi.service.js";

// Customer side: no login.
@Public()
@Controller("public/requests")
export class PublicRequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly access: PublicAccessService,
    private readonly documents: DocumentsService,
     private readonly notify: RequestNotificationsService,
  ) {}

  @Get("services")
  services() {
    return this.access.formServices();
  }

  @Post()
  async submit(@Body() dto: SubmitRequestDto, @Req() req: any) {
    const request = await this.requests.create(dto, auditContext(req), RequestSource.WEBSITE);
    return {
      reference: request.reference,
      status: request.status,
      service: request.serviceName,
      message: `Thank you! Your request number is ${request.reference}. We sent a confirmation to ${request.customer.email}.`,
    };
  }

  @Post("track")
  @HttpCode(200)
  track(@Body() dto: TrackRequestDto) {
    return this.access.track(dto.reference, dto.email);
  }

  // { email } -> emails a 6-digit code (same answer whether the email is known or not)
  @Post("access-code")
  @HttpCode(200)
  sendCode(@Body() dto: RequestAccessCodeDto) {
    return this.access.sendCode(dto.email);
  }

    // The customer sends documents. multipart/form-data: reference, email, label?, files (1-10)
  @Post("documents")
  @UseInterceptors(
    FilesInterceptor("files", MAX_FILES, {
      limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
      fileFilter: (_req: any, file: any, cb: any) =>
        ALLOWED_TYPES.includes(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException(`"${file.originalname}" is not allowed. Use PDF, JPG, PNG, WEBP or Word.`), false),
    }),
  )
  async uploadDocuments(@UploadedFiles() files: any[], @Body() dto: PublicUploadDocumentsDto, @Req() req: any) {
    if (!files?.length) throw new BadRequestException("Choose at least one file");
    const reference = dto.reference.toUpperCase();
    const request = await this.access.findForUpload(reference, dto.email, clientIp(req), files.length);
        await this.documents.upload(request.id, files, dto.label, auditContext(req));
    void this.notify.customerUploaded(
      request.id,
      files.map((f) => ({ name: f.originalname, size: f.size })),
      dto.label,
    );

    return this.access.track(reference, dto.email);
  }

  // { email, code } -> { token, expiresAt, requests }
  @Post("verify-code")
  @HttpCode(200)
  verifyCode(@Body() dto: VerifyAccessCodeDto) {
    return this.access.verifyCode(dto.email, dto.code);
  }


  @Get("mine")
  mine(@Headers("authorization") authorization?: string) {
    return this.access.listFor(this.access.emailFromToken(authorization));
  }

  @Get("mine/:reference")
  mineOne(@Param("reference") reference: string, @Headers("authorization") authorization?: string) {
    return this.access.oneFor(this.access.emailFromToken(authorization), reference.toUpperCase());
  }
}