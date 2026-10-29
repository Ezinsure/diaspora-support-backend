import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserStatus } from "../../users/user.entity.js";
import { IS_PUBLIC } from "../decorators/auth.decorators.js";
import { jwtOptions } from "../auth.config.js";

// Runs before every route
// Checks the access token AND the user in the database on every request,
// so a deactivated user or a changed password takes effect immediately.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw new UnauthorizedException("Please sign in");

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, jwtOptions());
    } catch {
      throw new UnauthorizedException("Your session has expired. Please sign in again.");
    }

    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: { id: true, names: true, email: true, role: true, status: true, tokenVersion: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException("Your session has ended. Please sign in again.");
    }

    req.user = { id: user.id, names: user.names, email: user.email, role: user.role, sessionId: payload.sid };
    return true;
  }
}