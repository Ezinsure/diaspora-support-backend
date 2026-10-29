import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, MoreThan, Repository } from "typeorm";
import { User, UserRole, UserStatus } from "../users/user.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { PasswordToken, PasswordTokenType } from "./entities/password-token.entity.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import { MailService } from "../mail/mail.service.js";
import { CompanyService } from "../company/company.service.js";
import { auditContext, clientIp, type AuditContext } from "../common/audit-context.js";
import { AUTH, adminSiteUrl, jwtOptions, readCookie, REFRESH_COOKIE, refreshCookieOptions } from "./auth.config.js";
import { assertStrongPassword, fakeVerify, hashPassword, hitLimit, maskEmail, randomToken, sha256, verifyPassword } from "./security.utils.js";
import { type Brand, inviteEmail, passwordChangedEmail, resetEmail } from "./auth-emails.js";
import type { AuthUser } from "./decorators/auth.decorators.js";
import type { AdminSetPasswordDto, ChangePasswordDto, LoginDto, ResetPasswordDto } from "./dto/auth.dto.js";

const WRONG_LOGIN = "Email or password is incorrect";
const BAD_LINK = "This link is invalid or has expired. Ask for a new one.";

// Columns needed to check a password (they are select: false on the entity)
const SECURE_COLUMNS = ["user.passwordHash", "user.failedLoginCount", "user.lockedUntil", "user.tokenVersion"];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
    @InjectRepository(PasswordToken) private readonly tokens: Repository<PasswordToken>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly logs: ActivityLogsService,
    private readonly mail: MailService,
    private readonly company: CompanyService,
  ) {}

  // Login / sessions
  async login(dto: LoginDto, req: any, res: any) {
    const ip = clientIp(req) ?? "unknown";
    this.limit(`login:ip:${ip}`, 30, 15, "Too many sign-in attempts. Try again in a few minutes.");
    this.limit(`login:email:${dto.email}`, 10, 15, "Too many sign-in attempts. Try again in a few minutes.");

    const user = await this.users
      .createQueryBuilder("user")
      .addSelect(SECURE_COLUMNS)
      .where("LOWER(user.email) = LOWER(:email)", { email: dto.email })
      .getOne();

    if (!user) {
      await fakeVerify(dto.password);
      throw new UnauthorizedException(WRONG_LOGIN);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(`Too many wrong passwords. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const ok = await verifyPassword(dto.password, user.passwordHash);
    if (!ok) {
      const failed = (user.failedLoginCount ?? 0) + 1;
      const lock = failed >= AUTH.maxFailedLogins;
      await this.users.update(user.id, {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + AUTH.lockMinutes * 60000) : null,
      });
      if (lock) {
        await this.logs.log(this.ctx(req, user), {
          action: LogAction.LOGIN,
          entity: LogEntity.USER,
          entityId: user.id,
          summary: `Account locked for ${AUTH.lockMinutes} minutes after ${AUTH.maxFailedLogins} wrong passwords (${user.email})`,
        });
      }
      throw new UnauthorizedException(WRONG_LOGIN);
    }

    // Right password: only now we may say the account is deactivated
    if (user.status !== UserStatus.ACTIVE) throw new ForbiddenException("Your account is deactivated. Contact an admin.");

    await this.users.update(user.id, { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastActiveAt: new Date() });

    const remember = dto.rememberMe === true;
    const { refreshToken, session } = await this.createSession(this.dataSource.manager, user.id, remember, req);
    this.setRefreshCookie(res, refreshToken, remember ? session.expiresAt : null);

    await this.logs.log(this.ctx(req, user), { action: LogAction.LOGIN, entity: LogEntity.USER, entityId: user.id, summary: `${user.names} signed in` });

    return { ...(await this.accessToken(user, session.id)), user: await this.me(user.id) };
  }

  // New access token from the refresh cookie.
  async refresh(req: any, res: any) {
    this.assertSameOrigin(req);
    const raw = readCookie(req, REFRESH_COOKIE);
    if (!raw) throw new UnauthorizedException("Please sign in");

    const hash = sha256(raw);
    const session = await this.sessions.findOne({ where: [{ tokenHash: hash }, { previousTokenHash: hash }] });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException("Your session has ended. Please sign in again.");
    }

    // An OLD token was used
    if (session.previousTokenHash === hash) {
      const justRotated = session.rotatedAt && Date.now() - session.rotatedAt.getTime() < AUTH.rotationGraceSec * 1000;
      if (!justRotated) {
        // Not two tabs at the same moment 
        await this.revokeAllSessions(this.dataSource.manager, session.userId);
        await this.logs.log(this.ctx(req, null), {
          action: LogAction.LOGOUT,
          entity: LogEntity.USER,
          entityId: session.userId,
          summary: "All sessions ended: an old sign-in token was reused.",
        });
        this.clearRefreshCookie(res);
        throw new UnauthorizedException("Your session has ended. Please sign in again.");
      }
      // Two tabs refreshed together
      const user = await this.activeUser(session.userId);
      return { ...(await this.accessToken(user, session.id)), user: await this.me(user.id) };
    }

    const user = await this.activeUser(session.userId);

    const next = randomToken();
    session.previousTokenHash = session.tokenHash;
    session.tokenHash = sha256(next);
    session.rotatedAt = new Date();
    session.lastUsedAt = new Date();
    await this.sessions.save(session);
    await this.users.update(user.id, { lastActiveAt: new Date() });

    this.setRefreshCookie(res, next, session.rememberMe ? session.expiresAt : null);
    return { ...(await this.accessToken(user, session.id)), user: await this.me(user.id) };
  }

  async logout(req: any, res: any) {
    this.assertSameOrigin(req);
    const raw = readCookie(req, REFRESH_COOKIE);
    if (raw) {
      const session = await this.sessions.findOne({ where: { tokenHash: sha256(raw) } });
      if (session && !session.revokedAt) {
        await this.sessions.update(session.id, { revokedAt: new Date() });
        await this.logs.log(this.ctx(req, null, session.userId), {
          action: LogAction.LOGOUT,
          entity: LogEntity.USER,
          entityId: session.userId,
          summary: "Signed out",
        });
      }
    }
    this.clearRefreshCookie(res);
    return { signedOut: true };
  }

  // "Sign out everywhere"
  async logoutAll(user: AuthUser, req: any, res: any) {
    await this.dataSource.transaction(async (em) => {
      await this.revokeAllSessions(em, user.id);
      await this.logs.log(auditContext(req), { action: LogAction.LOGOUT, entity: LogEntity.USER, entityId: user.id, summary: `${user.names} signed out on all devices` }, em);
    });
    this.clearRefreshCookie(res);
    return { signedOut: true };
  }

  // The signed-in user's profile
  async me(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, names: true, email: true, phoneNumber: true, role: true, status: true, lastLoginAt: true, passwordSetAt: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException("Please sign in");
    return user;
  }

  //Passwords

  // Signed-in user changes their own password
  async changePassword(authUser: AuthUser, dto: ChangePasswordDto, req: any, res: any) {
    const user = await this.users.createQueryBuilder("user").addSelect(SECURE_COLUMNS).where("user.id = :id", { id: authUser.id }).getOne();
    if (!user) throw new UnauthorizedException("Please sign in");

    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) throw new BadRequestException("Your current password is not correct");
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException("Choose a password different from the current one");
    assertStrongPassword(dto.newPassword, { email: user.email, names: user.names });

    await this.dataSource.transaction(async (em) => {
      await this.setPassword(em, user.id, dto.newPassword);
      await this.logs.log(auditContext(req), { action: LogAction.PASSWORD, entity: LogEntity.USER, entityId: user.id, summary: `${user.names} changed their password` }, em);
    });
    this.clearRefreshCookie(res);
    void this.sendMail(user.email, passwordChangedEmail(await this.brand(), user, null));
    return { changed: true, message: "Password changed. Please sign in again." };
  }

  // Always the same answer
  async forgotPassword(email: string, req: any) {
    const generic = { message: "We sent a link to reset the password. Check your inbox ." };
    const ip = clientIp(req) ?? "unknown";
    this.limit(`forgot:ip:${ip}`, 10, 15, "Too many requests. Try again in a few minutes.");
    if (!hitLimit(`forgot:email:${email}`, 3, 15 * 60000).allowed) return generic; 

    const user = await this.users.createQueryBuilder("user").where("LOWER(user.email) = LOWER(:email)", { email }).getOne();
    if (!user || user.status !== UserStatus.ACTIVE) return generic;

    // Never set a password yet -> send a fresh invitation instead
    const type = user.passwordSetAt ? PasswordTokenType.RESET : PasswordTokenType.INVITE;
    await this.sendPasswordLink(user.id, type, this.ctx(req, null), null);
    return generic;
  }

  // Before showing the "set password" form: is the link still good?
  async checkToken(raw: string) {
    const token = await this.validToken(raw);
    const user = await this.users.findOne({ where: { id: token.userId } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new BadRequestException(BAD_LINK);
    return { valid: true, type: token.type, email: maskEmail(user.email), firstName: user.names.split(" ")[0], expiresAt: token.expiresAt };
  }

  // Invitation (set) and forgot password (reset)
  async resetPassword(dto: ResetPasswordDto, req: any) {
    this.limit(`reset:ip:${clientIp(req) ?? "unknown"}`, 20, 15, "Too many attempts. Try again in a few minutes.");

    const token = await this.validToken(dto.token);
    const user = await this.users.findOne({ where: { id: token.userId } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new BadRequestException(BAD_LINK);
    assertStrongPassword(dto.password, { email: user.email, names: user.names });

    await this.dataSource.transaction(async (em) => {
      // Use the link (only once) and cancel any other open link of this user
      const used = await em.update(PasswordToken, { id: token.id, usedAt: IsNull() }, { usedAt: new Date() });
      if (!used.affected) throw new BadRequestException(BAD_LINK);
      await em.update(PasswordToken, { userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });

      await this.setPassword(em, user.id, dto.password);
      await this.logs.log(
        this.ctx(req, user),
        {
          action: LogAction.PASSWORD,
          entity: LogEntity.USER,
          entityId: user.id,
          summary: token.type === PasswordTokenType.INVITE ? `${user.names} set their password (account activated)` : `${user.names} reset their password`,
        },
        em,
      );
    });

    if (token.type === PasswordTokenType.RESET) void this.sendMail(user.email, passwordChangedEmail(await this.brand(), user, null));
    return { done: true, message: "Your password is set. You can sign in now.", email: user.email };
  }

  // Admin / dev sets someone else's password
  async adminSetPassword(targetId: string, dto: AdminSetPasswordDto, actor: AuthUser, req: any) {
    if (targetId === actor.id) throw new BadRequestException("To change your own password, use “Change password” in your profile");

    const target = await this.users.findOne({ where: { id: targetId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.role === UserRole.DEV && actor.role !== UserRole.DEV) throw new ForbiddenException("Only a dev can change a dev's password");
    assertStrongPassword(dto.password, { email: target.email, names: target.names });

    await this.dataSource.transaction(async (em) => {
      await this.setPassword(em, target.id, dto.password);
      await em.update(PasswordToken, { userId: target.id, usedAt: IsNull() }, { usedAt: new Date() });
      await this.logs.log(auditContext(req), { action: LogAction.PASSWORD, entity: LogEntity.USER, entityId: target.id, summary: `Set a new password for ${target.names}` }, em);
    });

    if (dto.notifyUser !== false) void this.sendMail(target.email, passwordChangedEmail(await this.brand(), target, actor.names));
    return { changed: true };
  }

  // Admin / dev: (re)send the invitation or a reset link
  async adminSendLink(targetId: string, actor: AuthUser, req: any) {
    const target = await this.users.findOne({ where: { id: targetId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.status !== UserStatus.ACTIVE) throw new BadRequestException("Activate this user first");
    if (target.role === UserRole.DEV && actor.role !== UserRole.DEV) throw new ForbiddenException("Only a dev can do this for a dev account");

    const type = target.passwordSetAt ? PasswordTokenType.RESET : PasswordTokenType.INVITE;
    const sent = await this.sendPasswordLink(target.id, type, auditContext(req), actor.id);
    if (!sent) throw new BadRequestException("The email could not be sent. Check the mail settings.");
    return { sent: true, type, message: type === PasswordTokenType.INVITE ? `Invitation sent to ${target.email}` : `Reset link sent to ${target.email}` };
  }

  // Used by other modules

  // Creates a one-time link and emails it. Returns false if the email failed.
  async sendPasswordLink(userId: string, type: PasswordTokenType, ctx: AuditContext, createdById: string | null) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return false;

    const link = await this.createPasswordLink(userId, type, createdById);
    const brand = await this.brand();
    const message = type === PasswordTokenType.INVITE ? inviteEmail(brand, user, link, AUTH.inviteHours) : resetEmail(brand, user, link, AUTH.resetMinutes);
    const sent = await this.sendMail(user.email, message);

    await this.logs.log(ctx, {
      action: LogAction.EMAIL,
      entity: LogEntity.USER,
      entityId: user.id,
      summary: `${type === PasswordTokenType.INVITE ? "Invitation" : "Password reset link"} ${sent ? "sent" : "could not be sent"} to ${user.email}`,
    });
    return sent;
  }

  // Link only (used by the create-dev script to print it)
  async createPasswordLink(userId: string, type: PasswordTokenType, createdById: string | null) {
    const raw = randomToken();
    await this.dataSource.transaction(async (em) => {
      // Only the newest link of each kind works
      await em.update(PasswordToken, { userId, type, usedAt: IsNull() }, { usedAt: new Date() });
      const ms = type === PasswordTokenType.INVITE ? AUTH.inviteHours * 3600_000 : AUTH.resetMinutes * 60_000;
      await em.save(em.create(PasswordToken, { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ms), usedAt: null, createdById }));
    });
    return `${adminSiteUrl()}/set-password?token=${encodeURIComponent(raw)}`;
  }

  // Deactivated / deleted / password changed: every device signed out
  async revokeAllSessions(em: EntityManager, userId: string) {
    await em.update(AuthSession, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    await em.increment(User, { id: userId }, "tokenVersion", 1);
  }

  //Helpers
  private async setPassword(em: EntityManager, userId: string, password: string) {
    await em.update(User, userId, {
      passwordHash: await hashPassword(password),
      passwordSetAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    });
    await this.revokeAllSessions(em, userId);
  }

  private async createSession(em: EntityManager, userId: string, remember: boolean, req: any) {
    const refreshToken = randomToken();
    const ms = remember ? AUTH.refreshDaysRemember() * 86400_000 : AUTH.refreshHoursSession() * 3600_000;
    const session = await em.save(
      em.create(AuthSession, {
        userId,
        tokenHash: sha256(refreshToken),
        previousTokenHash: null,
        rotatedAt: null,
        rememberMe: remember,
        expiresAt: new Date(Date.now() + ms),
        revokedAt: null,
        ip: clientIp(req),
        userAgent: req?.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null,
        lastUsedAt: new Date(),
      }),
    );
    return { refreshToken, session };
  }

  private async accessToken(user: User, sessionId: string) {
    const expiresIn = AUTH.accessTtlSec();
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, tv: user.tokenVersion ?? 0, sid: sessionId }, { ...jwtOptions(), expiresIn });
    return { accessToken, expiresIn };
  }

  private async activeUser(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, names: true, email: true, role: true, status: true, tokenVersion: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException("Your session has ended. Please sign in again.");
    return user;
  }

  private async validToken(raw: string) {
    const token = await this.tokens.findOne({ where: { tokenHash: sha256(raw ?? ""), usedAt: IsNull(), expiresAt: MoreThan(new Date()) } });
    if (!token) throw new BadRequestException(BAD_LINK);
    return token;
  }

  private setRefreshCookie(res: any, token: string, expiresAt: Date | null) {
    res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt ? expiresAt.getTime() - Date.now() : undefined));
  }

  private clearRefreshCookie(res: any) {
    const { maxAge: _ignore, ...opts } = refreshCookieOptions() as any;
    res.clearCookie(REFRESH_COOKIE, opts);
  }

  // Cookie-based routes only accept calls from our own frontend (CSRF protection)
  private assertSameOrigin(req: any) {
    const origin: string | undefined = req.headers?.origin;
    if (!origin) return; // same-origin requests and server tools don't send it
    const allowed = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",").map((u) => u.trim().replace(/\/$/, ""));
    if (!allowed.includes(origin.replace(/\/$/, ""))) throw new ForbiddenException("Request not allowed");
  }

  private limit(key: string, max: number, minutes: number, message: string) {
    const { allowed, retryAfterSec } = hitLimit(key, max, minutes * 60000);
    if (!allowed) throw new HttpException({ statusCode: 429, message, retryAfter: retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private ctx(req: any, user: Pick<User, "id" | "names" | "role"> | null, userId?: string): AuditContext {
    const base = auditContext(req);
    return { ...base, actorId: user?.id ?? userId ?? null, actorName: user?.names ?? null, actorRole: user?.role ?? null };
  }

  private async brand(): Promise<Brand> {
    try {
      const c = await this.company.get();
      if (c) return { name: c.name, logoUrl: c.logoUrl, email: c.email, phone: c.phone };
    } catch {}
    return { name: process.env.COMPANY_NAME ?? "Diaspora Services" };
  }

  private async sendMail(to: string, message: { subject: string; html: string; text: string }) {
    try {
      return await this.mail.send({ to, ...message });
    } catch (err: any) {
      this.logger.error(`Auth email failed: ${err?.message ?? err}`);
      return false;
    }
  }
}