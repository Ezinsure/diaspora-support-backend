import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service.js";
import { Public } from "./auth/decorators/auth.decorators.js";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  info() {
    return this.appService.info();
  }
@Public()
  @Get("health")
  health() {
    return this.appService.health();
  }
}