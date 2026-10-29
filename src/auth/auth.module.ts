import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/user.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { PasswordToken } from "./entities/password-token.entity.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { ActivityLogsModule } from "../activityLogs/activity.module.js";
import { CompanyModule } from "../company/company.module.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuthSession, PasswordToken]),
    JwtModule.register({}), 
    ActivityLogsModule,
    CompanyModule, 
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Global: EVERY route needs a signed-in user unless marked @Public(), then @Roles(...) is checked
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService], 
})
export class AuthModule {}