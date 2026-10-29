import { BadRequestException } from "@nestjs/common";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// Passwords (scrypt, built into Node: no native package)
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLen: 64, maxmem: 128 * 1024 * 1024 };

const scrypt = (password: string, salt: Buffer, keyLen: number, opts: any) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))));

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keyLen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
};

export const verifyPassword = async (password: string, stored: string | null | undefined) => {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
};

// Used when the email doesn't exist
let dummyHash: Promise<string> | null = null;
export const fakeVerify = async (password: string) => {
  dummyHash ??= hashPassword("not-a-real-password-1");
  await verifyPassword(password, await dummyHash);
  return false;
};

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "11111111",
  "iloveyou", "admin123", "welcome1", "letmein1", "abc12345", "passw0rd", "rwanda123", "kigali123", "changeme1",
]);

// Rules for every new password. Throws a clear 400 message.
export const assertStrongPassword = (password: string, context: { email?: string; names?: string } = {}) => {
  const p = String(password ?? "");
  const lower = p.toLowerCase();
  const problems: string[] = [];

  if (p.length < 8) problems.push("have at least 8 characters");
  if (p.length > 128) problems.push("have at most 128 characters");
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) problems.push("have at least one letter and one number");
  if (COMMON.has(lower)) problems.push("not be a common password");

  const emailName = context.email?.split("@")[0]?.toLowerCase();
  if (emailName && emailName.length >= 4 && lower.includes(emailName)) problems.push("not contain your email");
  const firstName = context.names?.split(/\s+/)[0]?.toLowerCase();
  if (firstName && firstName.length >= 4 && lower.includes(firstName)) problems.push("not contain your name");

  if (problems.length) throw new BadRequestException(`The password must ${problems.join(", ")}.`);
};

//Random tokens 

export const randomToken = () => randomBytes(32).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(name.length - 2, 3))}@${domain}`;
};

// Simple rate limit (in memory, one server)

const buckets = new Map<string, { count: number; resetAt: number }>();

// true = allowed.
export const hitLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
};