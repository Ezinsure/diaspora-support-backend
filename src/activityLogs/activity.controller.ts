import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ActivityLogsService } from './activty.service.js';
import { ListLogsQueryDto } from './activity.query.js';
import { Roles } from '../auth/decorators/auth.decorators.js';
import { UserRole } from '../users/user.entity.js';

Roles(UserRole.ADMIN, UserRole.HR)
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
