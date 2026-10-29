export enum RequestStatus {
  PENDING = "pending", // received, not paid / started yet
  IN_PROGRESS = "in_progress", // paid (or started), we are working on it
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum PaymentMethod {
  MOBILE_MONEY = "mobile_money",
  BANK_TRANSFER = "bank_transfer",
  CARD = "card",
  CASH = "cash",
  OTHER = "other",
}

export enum RequestSource {
  WEBSITE = "website", // customer filled the public form
  ADMIN = "admin", // staff created it (email / WhatsApp / call)
}

// Allowed status moves. Payment moves pending -> in_progress automatically.
export const STATUS_FLOW: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.PENDING]: [RequestStatus.IN_PROGRESS, RequestStatus.CANCELLED],
  [RequestStatus.IN_PROGRESS]: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
  [RequestStatus.COMPLETED]: [],
  [RequestStatus.CANCELLED]: [],
};

export const CLOSED_STATUSES = [RequestStatus.COMPLETED, RequestStatus.CANCELLED];
export const isClosed = (status: RequestStatus) => CLOSED_STATUSES.includes(status);

export const STATUS_LABEL: Record<RequestStatus, string> = {
  [RequestStatus.PENDING]: "Pending",
  [RequestStatus.IN_PROGRESS]: "In progress",
  [RequestStatus.COMPLETED]: "Completed",
  [RequestStatus.CANCELLED]: "Cancelled",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.MOBILE_MONEY]: "Mobile money",
  [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
  [PaymentMethod.CARD]: "Card",
  [PaymentMethod.CASH]: "Cash",
  [PaymentMethod.OTHER]: "Other",
};

export interface ProformaItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

// Stored as JSON on the request
export interface Proforma {
  number: string; // PF-2026-0001
  currency: string;
  items: ProformaItem[];
  total: number;
  validUntil: string | null; // YYYY-MM-DD
  note: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null; // last time it was emailed
}

export type PaymentState = "unpaid" | "partial" | "paid";

// unpaid / partial / paid from the amounts on the request
export const paymentState = (amountDue: number | null, amountPaid: number): PaymentState => {
  if (!amountPaid) return "unpaid";
  if (amountDue === null || amountPaid >= amountDue) return "paid";
  return "partial";
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const money = (amount: number | null | undefined, currency: string) =>
  `${currency} ${Number(amount ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// numeric columns come back as strings -> numbers
export const numeric = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : Number(v)),
};