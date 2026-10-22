import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { ListQueryDto } from "../common/query.js";

const trim = ({ value }: any) => (typeof value === "string" ? value.trim() : value);
const toBool = ({ value }: any) => (value === "true" ? true : value === "false" ? false : value);

// POST /faqs
export class CreateFaqDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

// PATCH 
export class UpdateFaqDto extends PartialType(CreateFaqDto) {}

// PATCH /faqs/reorder  
export class ReorderFaqsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  ids: string[];
}

// GET /faqs?search=&isPublished=&sortBy=&order=&page=&limit=
export class ListFaqsQueryDto extends ListQueryDto {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsIn(["sortOrder", "createdAt", "updatedAt", "question"])
  sortBy: string = "sortOrder";

  @IsOptional()
  @IsIn(["ASC", "DESC", "asc", "desc"])
  order: string = "ASC";
}