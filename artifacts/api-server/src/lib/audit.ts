import type { Request } from "express";
import { db, auditEventsTable, AUDIT_ACTION_VALUES, type AuditActionValue } from "@workspace/db";
import { logger } from "./logger";

// Re-export the canonical action list (defined in the DB schema as a
// pgEnum) so call sites can import from "../lib/audit" without reaching
// into @workspace/db directly.
export const AUDIT_ACTIONS = AUDIT_ACTION_VALUES;
export type AuditAction = AuditActionValue;

export interface AuditEventInput {
  organizationId?: number | null;
  projectId?: number | null;
  /** Organization id of the actor that triggered the event (often same as organizationId). */
  actorOrganizationId?: number | null;
  /** Deprecated alias for actorOrganizationId — preserved while older call sites migrate. */
  actorClientId?: number | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  category: string;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

async function writeAuditRow(event: AuditEventInput): Promise<void> {
  try {
    await db.insert(auditEventsTable).values({
      organizationId: event.organizationId ?? null,
      projectId: event.projectId ?? null,
      actorOrganizationId: event.actorOrganizationId ?? event.actorClientId ?? null,
      actorUserId: event.actorUserId ?? null,
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
    logger.error({ err, event }, "Failed to record audit event");
  }
}

/**
 * Records an audit event. Awaited at call sites that already use `await`,
 * but writes are also wrapped in try/catch internally so a failure here
 * never bubbles into the request response path.
 *
 * Existing call sites use `await recordAuditEvent(...)` and that contract
 * is preserved.
 */
export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  await writeAuditRow(event);
}

/**
 * Fire-and-forget variant for handlers where we don't want to add latency
 * to the response. Errors are still logged from inside writeAuditRow.
 */
export function recordAuditEventAsync(event: AuditEventInput): void {
  setImmediate(() => {
    void writeAuditRow(event);
  });
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
