import { Body, Controller, Get, Patch, Put, Req } from "@nestjs/common";
import { CompanyService } from "./company.service.js";
import { UpdateCompanyProfileDto, UpsertCompanyProfileDto } from "./company.dto.js";
import { auditContext } from "../common/audit-context.js";

@Controller("company-profile")
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  get() {
    return this.company.get();
  }

  // PUT /company-profile -> create or replace everything
  @Put()
  upsert(@Body() dto: UpsertCompanyProfileDto, @Req() req: any) {
    return this.company.upsert(dto, auditContext(req));
  }

  // PATCH /company-profile -> change some fields, 
  @Patch()
  update(@Body() dto: UpdateCompanyProfileDto, @Req() req: any) {
    return this.company.update(dto, auditContext(req));
  }
}