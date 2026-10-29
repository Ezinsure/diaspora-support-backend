// What happened
export enum LogAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  STATUS = "status",
  UPLOAD = "upload",
  PAYMENT = "payment",
  LOGIN = "login",
  LOGOUT = "logout",
  PASSWORD = "password", 
  REORDER = "reorder",
  EMAIL = "email",
}

// To what.
export enum LogEntity {
  REQUEST = "request",
  CUSTOMER = "customer",
  QUOTATION = "quotation",
  PROFORMA = "proforma",
  PAYMENT = "payment",
  DOCUMENT = "document",
  USER = "user",
  SERVICE = "service",
  SERVICE_FEE = "service_fee",
  FAQ = "faq",
  COMPANY = "company",
}

export type { AuditContext } from "../common/audit-context.js";

export interface FieldChange {
  field: string;
  from: any;
  to: any;
}

export interface LogInput {
  action: LogAction;
  entity: LogEntity;
  entityId?: string | null;
  summary: string;
  changes?: FieldChange[];
}