import { Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";

let devSecret: string | null = null;

export const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is missing .");
  }
  if (!devSecret) {
    devSecret = randomBytes(48).toString("hex");
    new Logger("Auth").warn("JWT_SECRET not set.");
  }
  return devSecret;
};

export const jwtOptions = () => ({ secret: jwtSecret(), issuer: "diaspora-support", audience: "diaspora-admin" });

export const AUTH = {
  accessTtlSec: () => Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 15 * 60), // 15 minutes
  refreshDaysRemember: () => Number(process.env.REFRESH_DAYS_REMEMBER ?? 30), // "Remember me"
  refreshHoursSession: () => Number(process.env.REFRESH_HOURS_SESSION ?? 12), // not remembered
  inviteHours: 48,
  resetMinutes: 60,
  maxFailedLogins: 5,
  lockMinutes: 15,
  rotationGraceSec: 20,
};

// Refresh cookie 
export const REFRESH_COOKIE = "ds_rt";

// Only sent to /v1/auth/... and never readable by JavaScript
export const refreshCookieOptions = (maxAgeMs?: number) => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
  sameSite: (process.env.COOKIE_SAMESITE ?? "lax") as "lax" | "strict" | "none",
  path: `/${(process.env.API_PREFIX ?? "v1").replace(/^\/|\/$/g, "")}/auth`,
  domain: process.env.COOKIE_DOMAIN || undefined,
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

export const readCookie = (req: any, name: string): string | null => {
  const header: string = req.headers?.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
};

// Links in emails
export const adminSiteUrl = () => (process.env.ADMIN_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");