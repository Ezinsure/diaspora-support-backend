import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ListQueryDto } from "../common/query.js";

const trim = ({ value }: any) => (typeof value === "string" ? value.trim() : value);
const emptyToNull = ({ value }: any) => (typeof value === "string" ? value.trim() || null : value);

const cleanTags = ({ value }: any) => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  return value
    .map((t) => (typeof t === "string" ? t.trim().replace(/\s+/g, " ") : t))
    .filter((t) => {
      if (typeof t !== "string" || !t) return false;
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
};


const toBool = ({ value }: any) => (value === "true" ? true : value === "false" ? false : value);

export class CreateServiceDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  description?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  subDescription?: string | null;

  @IsOptional()
  @Transform(cleanTags)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export class ListServicesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tag?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "name"])
  sortBy: string = "createdAt";
}