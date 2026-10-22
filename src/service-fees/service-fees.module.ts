import { Module } from '@nestjs/common';
import { ServiceFeesService } from './service-fees.service.js';
import { ServiceFeesController } from './service-fees.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceFee } from './fees.entity.js';
import { Service } from '../services/service.entity.js';
import { ActivityLogsModule } from '../activityLogs/activity.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceFee, Service]), ActivityLogsModule],
  controllers: [ServiceFeesController],
  providers: [ServiceFeesService],
})
export class ServiceFeesModule {}
