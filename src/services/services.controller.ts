import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ServicesService } from "./services.service.js";
import { CreateServiceDto, ListServicesQueryDto, UpdateServiceDto } from "./service.dto.js";
import { auditContext } from "../common/audit-context.js";
import { UserRole } from "../users/user.entity.js";
import { Public, Roles } from "../auth/decorators/auth.decorators.js";

@Roles(UserRole.ADMIN, UserRole.HR)
@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListServicesQueryDto) {
    return this.services.findAll(query);
  }

  @Get("tags")
  tags() {
    return this.services.tags();
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.services.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateServiceDto, @Req() req: any) {
    return this.services.create(dto, auditContext(req));
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto, @Req() req: any) {
    return this.services.update(id, dto, auditContext(req));
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return this.services.remove(id, auditContext(req));
  }
}