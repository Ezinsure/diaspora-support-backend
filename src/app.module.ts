import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ActivityLogsModule } from './activityLogs/activity.module.js';
import { databaseOptions } from './config/database.config.js';
import { UsersModule } from './users/users.module.js';
import { ServicesModule } from './services/services.module.js';
import { FaqsModule } from './faqs/faqs.module.js';
import { CompanyModule } from './company/company.module.js';
import { ServiceFeesModule } from './service-fees/service-fees.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...databaseOptions(),
        autoLoadEntities: true,
      }),
    }),

    ActivityLogsModule,
    UsersModule,
    ServicesModule,
    FaqsModule,
    CompanyModule,
    ServiceFeesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
