// req.user is filled by the auth guard (JWT) once login exists. Until then actor fields are null.

export interface AuditContext {
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const auditContext = (req: any): AuditContext => ({
  actorId: req?.user?.id ?? null,
  actorName: req?.user?.names ?? null,
  actorRole: req?.user?.role ?? null,
  ip: (req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.ip || null) as string | null,
  userAgent: (req?.headers?.["user-agent"] as string) ?? null,
});