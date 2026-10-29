import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Customer } from "./customers.entity.js";
import { CustomersService } from "./customers.service.js";
import { CustomersController } from "./customers.controller.js";
import { ActivityLogsModule } from "../activityLogs/activity.module.js";

@Module({
  imports: [TypeOrmModule.forFeature([Customer]), ActivityLogsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService], // requests use findOrCreate()
})
export class CustomersModule {}