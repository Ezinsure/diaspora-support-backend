import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ServiceFeesService } from "./service-fees.service.js";
import { CreateServiceFeeDto, ListServiceFeesQueryDto, UpdateServiceFeeDto } from "./fees.dto.js";
import { auditContext } from "../common/audit-context.js";

@Controller("service-fees")
export class ServiceFeesController {
  constructor(private readonly fees: ServiceFeesService) {}

  @Get()
  findAll(@Query() query: ListServiceFeesQueryDto) {
    return this.fees.findAll(query);
  }

  // Website / request form: GET /service-fees/public?serviceId=...  (above ":id")
  @Get("public")
  findPublic(@Query("serviceId", new ParseUUIDPipe({ optional: true })) serviceId?: string) {
    return this.fees.findPublic(serviceId);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.fees.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateServiceFeeDto, @Req() req: any) {
    return this.fees.create(dto, auditContext(req));
  }

  // Also activate / deactivate: { "isActive": false }
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateServiceFeeDto, @Req() req: any) {
    return this.fees.update(id, dto, auditContext(req));
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return this.fees.remove(id, auditContext(req));
  }
}