import { PartialType } from "@nestjs/mapped-types";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { ListQueryDto } from "../common/query.js";

const trim = ({ value }: any) => (typeof value === "string" ? value.trim() : value);
const upper = ({ value }: any) => (typeof value === "string" ? value.trim().toUpperCase() : value);
const emptyToNull = ({ value }: any) => (typeof value === "string" ? value.trim() || null : value);
const toBool = ({ value }: any) => (value === "true" ? true : value === "false" ? false : value);

export class CreateServiceFeeDto {
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  serviceId?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  amount: number;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode({ message: "currency must be a code like RWF, USD or EUR" })
  currency?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateServiceFeeDto extends PartialType(CreateServiceFeeDto) {}

export class ListServiceFeesQueryDto extends ListQueryDto {
  @IsOptional()
  @Matches(/^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: "serviceId must be a service id or 'none'",
  })
  serviceId?: string;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "name", "amount"])
  sortBy: string = "createdAt";
}