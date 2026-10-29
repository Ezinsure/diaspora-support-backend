import { Module } from '@nestjs/common';
import { CompanyService } from './company.service.js';
import { CompanyController } from './company.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from './company.entity.js';
import { ActivityLogsModule } from '../activityLogs/activity.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile]), ActivityLogsModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
