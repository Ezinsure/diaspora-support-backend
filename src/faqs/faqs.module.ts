import { Module } from '@nestjs/common';
import { FaqsService } from './faqs.service.js';
import { FaqsController } from './faqs.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsModule } from '../activityLogs/activity.module.js';
import { Faq } from './faqs.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Faq]), ActivityLogsModule],
  controllers: [FaqsController],
  providers: [FaqsService],
})
export class FaqsModule {}
