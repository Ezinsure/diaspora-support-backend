import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

const lower = ({ value }: any) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const trim = ({ value }: any) => (typeof value === "string" ? value.trim() : value);

export class LoginDto {
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email" })
  @MaxLength(160)
  email: string;

  @IsString()
  @IsNotEmpty({ message: "Enter your password" })
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ForgotPasswordDto {
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email" })
  @MaxLength(160)
  email: string;
}

export class CheckPasswordTokenDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}

export class ResetPasswordDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "This link is not valid" })
  @MaxLength(200)
  token: string;

  @IsString()
  @IsNotEmpty({ message: "Choose a password" })
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: "Enter your current password" })
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: "Choose a new password" })
  @MaxLength(128)
  newPassword: string;
}

// Admin / dev sets another user's password
export class AdminSetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: "Choose a password" })
  @MaxLength(128)
  password: string;

  // Email the user that their password was changed 
  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean;
}