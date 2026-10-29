import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsTimeZone, Matches, MaxLength } from "class-validator";
import { ListQueryDto } from "../common/query.js";

const trim = ({ value }: any) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value);
const lower = ({ value }: any) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const phone = ({ value }: any) => (typeof value === "string" ? value.replace(/[\s()-]/g, "") : value);
const emptyToNull = ({ value }: any) => (typeof value === "string" ? value.trim() || null : value);

export class UpdateCustomerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @Transform(phone)
  @Matches(/^\+\d{8,15}$/, { message: "Phone must be in international format, e.g. +250788123456" })
  phone?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsTimeZone()
  timezone?: string | null;
}


export class ListCustomersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsIn(["open", "to_pay"])
  activity?: "open" | "to_pay";

  @IsOptional()
  @IsIn(["createdAt", "lastName", "lastRequestAt", "requestCount"])
  sortBy: string = "lastRequestAt";
}