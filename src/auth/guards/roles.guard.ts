import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC, ROLES } from "../decorators/auth.decorators.js";
import { UserRole } from "../../users/user.entity.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest().user;
    if (user?.role === UserRole.DEV || roles.includes(user?.role)) return true;
    throw new ForbiddenException("You don't have permission to perform this action.");
  }
}