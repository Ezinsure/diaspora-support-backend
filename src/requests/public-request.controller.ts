import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from "@nestjs/common";
import { RequestsService } from "./requests.service.js";
import { PublicAccessService } from "./public-access.service.js";
import { RequestSource } from "./request.types.js";
import { auditContext } from "../common/audit-context.js";
import { RequestAccessCodeDto, SubmitRequestDto, TrackRequestDto, VerifyAccessCodeDto } from "./request.dto.js";

// Customer side: no login. Will stay open when the admin routes get protected.
@Controller("public/requests")
export class PublicRequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly access: PublicAccessService,
  ) {}

  // Services for the form's dropdown
  @Get("services")
  services() {
    return this.access.formServices();
  }

  // Send the form -> request created (pending) + emails to the customer and the team
  @Post()
  async submit(@Body() dto: SubmitRequestDto, @Req() req: any) {
    const request = await this.requests.create(dto, auditContext(req), RequestSource.WEBSITE);
    // Only what the customer needs back
    return {
      reference: request.reference,
      status: request.status,
      service: request.serviceName,
      message: `Thank you! Your request number is ${request.reference}. We sent a confirmation to ${request.customer.email}.`,
    };
  }

  // { reference, email } -> that one request
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

  // { email, code } -> { token, expiresAt, requests }
  @Post("verify-code")
  @HttpCode(200)
  verifyCode(@Body() dto: VerifyAccessCodeDto) {
    return this.access.verifyCode(dto.email, dto.code);
  }

  // Header: Authorization: Bearer <token>
  @Get("mine")
  mine(@Headers("authorization") authorization?: string) {
    return this.access.listFor(this.access.emailFromToken(authorization));
  }

  @Get("mine/:reference")
  mineOne(@Param("reference") reference: string, @Headers("authorization") authorization?: string) {
    return this.access.oneFor(this.access.emailFromToken(authorization), reference.toUpperCase());
  }
}