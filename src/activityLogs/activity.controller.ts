import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ActivityLogsService } from './activty.service.js';
import { ListLogsQueryDto } from './activity.query.js';

@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly logs: ActivityLogsService) {}

  @Get()
  findAll(@Query() query: ListLogsQueryDto) {
    return this.logs.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.logs.findOne(id);
  }
}
