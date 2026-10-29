import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceRequest } from "./request.entity.js";
import { RequestDocument } from "./request-docs.entity.js";
import { Payment } from "./payment.entity.js";
import { AccessCode } from "./access-code.entity.js";
import { Service } from "../services/service.entity.js";
import { Customer } from "../customers/customers.entity.js";
import { Counter } from "../common/counter.entity.js";
import { RequestsService } from "./requests.service.js";
import { PaymentsService } from "./payment.service.js";
import { DocumentsService } from "./document.service.js";
import { PublicAccessService } from "./public-access.service.js";
import { RequestNotificationsService } from "./request-notifi.service.js";
import { RequestsController } from "./requests.controller.js";
import { PublicRequestsController } from "./public-request.controller.js";
import { ActivityLogsModule } from "../activityLogs/activity.module.js";
import { CustomersModule } from "../customers/customers.module.js";
import { CompanyModule } from "../company/company.module.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, RequestDocument, Payment, AccessCode, Service, Customer, Counter]),
    ActivityLogsModule,
    CustomersModule,
    CompanyModule, // company name / logo in emails
    // MailModule and StorageModule are @Global (registered once in AppModule)
  ],
  controllers: [RequestsController, PublicRequestsController],
  providers: [RequestsService, PaymentsService, DocumentsService, PublicAccessService, RequestNotificationsService],
  exports: [RequestsService],
})
export class RequestsModule {}