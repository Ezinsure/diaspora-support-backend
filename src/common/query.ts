import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { SelectQueryBuilder } from 'typeorm';

export const TZ = 'Africa/Kigali';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Shared by every list endpoint
export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 25;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order: string = 'DESC';
}

// "%text%" with % and _ escaped, for ILIKE
export const likeTerm = (s: string) =>
  `%${s.trim().replace(/[\\%_]/g, '\\$&')}%`;

export const applyDateRange = (
  qb: SelectQueryBuilder<any>,
  column: string,
  from?: string,
  to?: string,
) => {
  if (from)
    qb.andWhere(
      `${column} >= (CAST(:from AS date)::timestamp AT TIME ZONE :tz)`,
      { from, tz: TZ },
    );
  if (to)
    qb.andWhere(
      `${column} < ((CAST(:to AS date) + 1)::timestamp AT TIME ZONE :tz)`,
      { to, tz: TZ },
    );
  return qb;
};

export const paginated = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) => ({
  data,
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

// Postgres "unique_violation" -> lets us turn a race-condition duplicate into a 409
export const isUniqueViolation = (err: any) =>
  err?.code === '23505' || err?.driverError?.code === '23505';

export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
