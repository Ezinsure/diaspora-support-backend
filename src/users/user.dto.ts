import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { ListQueryDto } from "../common/query.js";
import { UserRole, UserStatus } from "./user.entity.js";

const trim = ({ value }: any) => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: any) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const phone = ({ value }: any) => (typeof value === "string" ? value.replace(/[\s-]/g, "") : value);

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  names: string;

  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email" })
  @MaxLength(160)
  email: string;

  @Transform(phone)
  @Matches(/^\+\d{8,15}$/, { message: "Phone must be in international format, e.g. +250788123456" })
  phoneNumber: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}

export class ListUsersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "names", "email", "role", "status"])
  sortBy: string = "createdAt";
}