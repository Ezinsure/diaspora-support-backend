import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { FaqsService } from "./faqs.service.js";
import { CreateFaqDto, ListFaqsQueryDto, ReorderFaqsDto, UpdateFaqDto } from "./faqs.dto.js";
import { auditContext } from "../common/audit-context.js";

@Controller("faqs")
export class FaqsController {
  constructor(private readonly faqs: FaqsService) {}

  @Get()
  findAll(@Query() query: ListFaqsQueryDto) {
    return this.faqs.findAll(query);
  }

  // Website: GET /faqs/published (will be public once auth exists)
  @Get("published")
  findPublished() {
    return this.faqs.findPublished();
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.faqs.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateFaqDto, @Req() req: any) {
    return this.faqs.create(dto, auditContext(req));
  }

  // PATCH /faqs/reorder  { "ids": [...] }  (above ":id")
  @Patch("reorder")
  reorder(@Body() dto: ReorderFaqsDto, @Req() req: any) {
    return this.faqs.reorder(dto.ids, auditContext(req));
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto, @Req() req: any) {
    return this.faqs.update(id, dto, auditContext(req));
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return this.faqs.remove(id, auditContext(req));
  }
}