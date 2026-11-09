
import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { Public } from "../auth/decorators/auth.decorators.js";
import { clientIp } from "../common/audit-context.js";
import { PaymentLinksService } from "./payment-links.service.js";
import { PaymentChannel } from "./payment-link.entity.js";
import { PaymentLookupDto, PublicPayDto } from "./request.dto.js";
 
// Website: the customer finds their request (number + email) and pays it.
// Works even when emails are not sent.
@Public()
@Controller("public/payments")
export class PublicPaymentsController {
  constructor(private readonly links: PaymentLinksService) {}
 
  // -> status, quotation, balance, how they can pay
  @Post("lookup")
  @HttpCode(200)
  lookup(@Body() dto: PaymentLookupDto, @Req() req: any) {
    return this.links.lookup(dto.reference, dto.email, clientIp(req));
  }
 
  // card -> { url } (open it) ; momo -> prompt sent to { phone }
  @Post("pay")
  @HttpCode(200)
  pay(@Body() dto: PublicPayDto, @Req() req: any) {
    return this.links.pay(dto.reference, dto.email, dto.channel as PaymentChannel, dto.phone, clientIp(req));
  }
}