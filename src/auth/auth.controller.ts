import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { CurrentUser, Public, Roles, type AuthUser } from "./decorators/auth.decorators.js";
import { UserRole } from "../users/user.entity.js";
import {
  AdminSetPasswordDto,
  ChangePasswordDto,
  CheckPasswordTokenDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from "./dto/auth.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Public 

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    return this.auth.login(dto, req, res);
  }

  // Uses the refresh cookie -> new access token (+ new cookie)
  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    return this.auth.refresh(req, res);
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    return this.auth.logout(req, res);
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    return this.auth.forgotPassword(dto.email, req);
  }

  @Public()
  @Post("password-token/check")
  @HttpCode(200)
  checkToken(@Body() dto: CheckPasswordTokenDto) {
    return this.auth.checkToken(dto.token);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: any) {
    return this.auth.resetPassword(dto, req);
  }

  //Signed in 

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post("change-password")
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    return this.auth.changePassword(user, dto, req, res);
  }

  @Post("logout-all")
  @HttpCode(200)
  logoutAll(@CurrentUser() user: AuthUser, @Req() req: any, @Res({ passthrough: true }) res: any) {
    return this.auth.logoutAll(user, req, res);
  }

  //  Admin / dev 

  @Roles(UserRole.ADMIN)
  @Patch("users/:id/password")
  adminSetPassword(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AdminSetPasswordDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    return this.auth.adminSetPassword(id, dto, user, req);
  }

  // Resend the invitation 
  @Roles(UserRole.ADMIN)
  @Post("users/:id/send-password-link")
  @HttpCode(200)
  sendLink(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    return this.auth.adminSendLink(id, user, req);
  }
}