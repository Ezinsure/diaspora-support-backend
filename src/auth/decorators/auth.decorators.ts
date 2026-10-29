import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { UserRole } from "../../users/user.entity.js";

// Every route needs a signed-in user, unless marked @Public()
export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

// What the guard puts on req.user
export interface AuthUser {
  id: string;
  names: string;
  email: string;
  role: UserRole;
  sessionId?: string;
}

// @CurrentUser() user: AuthUser
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);