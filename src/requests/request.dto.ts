import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
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

export class RequestAccessCodeDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;
}

export class VerifyAccessCodeDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;

  @Transform(trimText)
  @Matches(/^\d{6}$/, { message: 'The code has 6 digits' })
  code: string;
}

export class CreateRequestDto extends SubmitRequestDto {
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  requiredDocuments?: string[];

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

export class SaveProformaDto {
  @IsArray()
  @ArrayMaxSize(49)
  @ValidateNested({ each: true })
  @Type(() => ProformaItemDto)
  items: ProformaItemDto[];

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

  // MoMo / bank transaction id 
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

  @IsOptional()
  @Type(() => Date)
  paidAt?: Date;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  sendReceipt?: boolean;
}

// DELETE /requests/:id/payments/:paymentId
export class VoidPaymentDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Say why this payment is voided' })
  @MaxLength(500)
  reason: string;
}

// POST /requests/:id/documents 
export class UploadDocumentsDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  label?: string | null;
}

// POST /public/requests/documents 
export class PublicUploadDocumentsDto extends TrackRequestDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(120)
  label?: string;
}

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
// IremboPay 

// POST /requests/:id/payment-links  { "channel": "card" | "momo" }
export class CreatePaymentLinkDto {
  @IsIn(["card", "momo"], { message: "channel must be card or momo" })
  channel: "card" | "momo";
}

// POST /requests/:id/payment-links/momo  { "phone": "0788123456" }
export class MomoPushDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Enter the MoMo number" })
  @MaxLength(20)
  phone: string;
}

// POST /public/payments/lookup  (website: reference + the email used on the request)
export class PaymentLookupDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Enter your request number" })
  @MaxLength(30)
  reference: string;

  @Transform(trim)
  @IsEmail({}, { message: "Enter the email you used for the request" })
  @MaxLength(255)
  email: string;
}

// POST /public/payments/pay
export class PublicPayDto extends PaymentLookupDto {
  @IsIn(["card", "momo"], { message: "Choose how to pay" })
  channel: "card" | "momo";

  // MoMo only
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;
}

