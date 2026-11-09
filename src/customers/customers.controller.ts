import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from "@nestjs/common";
import { CustomersService } from "./customers.service.js";
import { ListCustomersQueryDto, UpdateCustomerDto } from "./customers.dto.js";
import { auditContext } from "../common/audit-context.js";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  findAll(@Query() query: ListCustomersQueryDto) {
    return this.customers.findAll(query);
  }

@Get("stats")
stats() {
  return this.customers.stats();
}

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
    return this.customers.update(id, dto, auditContext(req));
  }
}