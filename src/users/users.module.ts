import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsModule } from '../activityLogs/activity.module.js';
import { User } from './user.entity.js';

@Module({
imports: [TypeOrmModule.forFeature([User]), ActivityLogsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
