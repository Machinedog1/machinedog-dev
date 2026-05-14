import type { Request } from "express";
import { db, auditEventsTable } from "@workspace/db";
import { logger } from "./logger";

export interface AuditEventInput {
  organizationId?: number | null;
  actorClientId?: number | null;
  actorEmail?: string | null;
  category: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await db.insert(auditEventsTable).values({
      organizationId: event.organizationId ?? null,
      actorClientId: event.actorClientId ?? null,
      actorEmail: event.actorEmail ?? null,
      category: event.category,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    });
  } catch (err) {
    // Audit must never block the parent operation. Log + swallow.
    logger.error({ err, event }, "Failed to record audit event");
  }
}

export function reqAuditMeta(req: Request): { ipAddress: string; userAgent: string } {
  const userAgent = (req.headers["user-agent"] ?? "").toString().slice(0, 512);
  const ipAddress = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "")
    .toString()
    .split(",")[0]
    .trim()
    .slice(0, 64);
  return { userAgent, ipAddress };
}
