export interface AuditContext {
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const clientIp = (req: any): string | null => (req?.ip ? String(req.ip).replace(/^::ffff:/, "") : null);

export const auditContext = (req: any): AuditContext => ({
  actorId: req?.user?.id ?? null,
  actorName: req?.user?.names ?? null,
  actorRole: req?.user?.role ?? null,
  ip: clientIp(req),
  userAgent: req?.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null,
});