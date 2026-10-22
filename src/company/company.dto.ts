import { PartialType } from "@nestjs/mapped-types";
import { Transform, Type } from "class-transformer";
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateNested } from "class-validator";

const trim = ({ value }: any) => (typeof value === "string" ? value.trim() : value);
const emptyToNull = ({ value }: any) => (typeof value === "string" ? value.trim() || null : value);
const lowerOrNull = ({ value }: any) => (typeof value === "string" ? value.trim().toLowerCase() || null : value);
const phoneOrNull = ({ value }: any) => (typeof value === "string" ? value.replace(/[\s-]/g, "") || null : value);
const URL_OPTS = { require_protocol: true, protocols: ["http", "https"] };

export class AddressDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  country?: string | null;
}

// PUT /company-profile (whole profile; creates it the first time)
export class UpsertCompanyProfileDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(5000)
  about?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl(URL_OPTS, { message: "logoUrl must be a full URL (https://...)" })
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @Transform(phoneOrNull)
  @Matches(/^\+\d{8,15}$/, { message: "Phone must be in international format, e.g. +250788123456" })
  phone?: string | null;

  @IsOptional()
  @Transform(lowerOrNull)
  @IsEmail({}, { message: "Enter a valid email" })
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl(URL_OPTS, { message: "websiteUrl must be a full URL (https://...)" })
  @MaxLength(300)
  websiteUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl(URL_OPTS, { message: "linkedinUrl must be a full URL (https://...)" })
  @Matches(/linkedin\.com\//i, { message: "linkedinUrl must be a linkedin.com link" })
  @MaxLength(300)
  linkedinUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

export class UpdateCompanyProfileDto extends PartialType(UpsertCompanyProfileDto) {}