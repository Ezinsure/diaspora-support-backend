import { Module } from '@nestjs/common';
import { ServicesService } from './services.service.js';
import { ServicesController } from './services.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsModule } from '../activityLogs/activity.module.js';
import { Service } from './service.entity.js';

@Module({
imports: [TypeOrmModule.forFeature([Service]), ActivityLogsModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService], 
})
export class ServicesModule {}
