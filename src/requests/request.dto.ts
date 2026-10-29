import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../common/query.js';
import { PaymentMethod, RequestStatus } from './request.types.js';

const trim = ({ value }: any) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const trimText = ({ value }: any) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: any) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upper = ({ value }: any) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const phone = ({ value }: any) =>
  typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value;
const emptyToNull = ({ value }: any) =>
  typeof value === 'string' ? value.trim() || null : value;
const PHONE = /^\+\d{8,15}$/;
const PHONE_MSG = 'Phone must be in international format, e.g. +250788123456';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// ================= Public form (customer, no login) =================

// POST /public/requests
export class SubmitRequestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  @MaxLength(160)
  email: string;

  @Transform(phone)
  @Matches(PHONE, { message: PHONE_MSG })
  phone: string;

  @IsUUID('4', { message: 'Choose a service' })
  serviceId: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  country?: string | null;

  // e.g. "Europe/Brussels"
  @IsOptional()
  @Transform(emptyToNull)
  @IsTimeZone({ message: 'Choose a valid time zone' })
  timezone?: string | null;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Tell us briefly what you need' })
  @MaxLength(1000)
  description: string;
}

// POST /public/requests/track  -> one request with reference + email
export class TrackRequestDto {
  @Transform(upper)
  @Matches(/^REQ-\d{4}-\d{4,}$/, {
    message: 'Reference looks like REQ-2026-0001',
  })
  reference: string;

  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;
}

// POST /public/requests/access-code -> email a 6-digit code
export class RequestAccessCodeDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;
}

// POST /public/requests/verify-code -> token + list of requests
export class VerifyAccessCodeDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;

  @Transform(trimText)
  @Matches(/^\d{6}$/, { message: 'The code has 6 digits' })
  code: string;
}

// ================= Admin =================

// POST /requests (staff creates it for a customer who called / wrote)
export class CreateRequestDto extends SubmitRequestDto {
  // Send the "we received your request" email (default yes)
  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

// PATCH /requests/:id
export class UpdateRequestDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string;

  // What the customer must bring (set after the call)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  requiredDocuments?: string[];

  // Amount agreed on the phone (when there is no proforma). null = not decided.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountDue?: number | null;

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency?: string;

  // Customer contact fixes (updates the customer, used by all their requests)
  @IsOptional()
  @Transform(phone)
  @Matches(PHONE, { message: PHONE_MSG })
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

// PATCH /requests/:id/status
export class UpdateRequestStatusDto {
  @IsEnum(RequestStatus)
  status: RequestStatus;

  // Required when cancelling (checked in the service)
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

export class ProformaItemDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

// PUT /requests/:id/proforma
export class SaveProformaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProformaItemDto)
  items: ProformaItemDto[];

  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @Matches(DAY, { message: 'validUntil must be YYYY-MM-DD' })
  validUntil?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  // Email it to the customer right away
  @IsOptional()
  @IsBoolean()
  send?: boolean;
}

// POST /requests/:id/payments
export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  // MoMo / bank transaction id (recommended: blocks recording the same payment twice)
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  transactionRef?: string | null;

  @IsOptional()
  @Transform(phone)
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(PHONE, { message: PHONE_MSG })
  payerPhone?: string | null;

  // When it was paid (ISO date-time). Default: now
  @IsOptional()
  @Type(() => Date)
  paidAt?: Date;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  // Email the receipt (default yes)
  @IsOptional()
  @IsBoolean()
  sendReceipt?: boolean;
}

// DELETE /requests/:id/payments/:paymentId  { "reason": "Recorded twice" }
export class VoidPaymentDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Say why this payment is voided' })
  @MaxLength(500)
  reason: string;
}

// POST /requests/:id/documents (multipart) -> optional label for the files
export class UploadDocumentsDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  label?: string | null;
}

// GET /requests?search=&status=&serviceId=&customerId=&payment=&from=&to=&sortBy=&order=&page=&limit=
export class ListRequestsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid'])
  payment?: 'unpaid' | 'partial' | 'paid';

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'reference', 'status', 'amountDue'])
  sortBy: string = 'createdAt';
}

// GET /requests/stats?from=&to=
export class RequestStatsQueryDto {
  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
