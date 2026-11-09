
import { Controller, Headers, HttpCode, Post, Req, type RawBodyRequest } from "@nestjs/common";
import { Public } from "../auth/decorators/auth.decorators.js";
import { PaymentLinksService } from "../requests/payment-links.service.js";
 
// IremboPay calls this when an invoice is paid.
// Set the URL in the IremboPay portal: https://<your-api>/v1/payments/irembopay/webhook
@Public()
@Controller("payments/irembopay")
export class IremboPayWebhookController {
  constructor(private readonly links: PaymentLinksService) {}
 
  @Post("webhook")
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<any>, @Headers("irembopay-signature") signature?: string) {
    return this.links.webhook(req.rawBody, signature);
  }
}