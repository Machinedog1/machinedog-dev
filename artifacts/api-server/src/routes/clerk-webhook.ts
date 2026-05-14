/**
 * POST /api/clerk/webhook
 *
 * Receives Clerk identity events and keeps the local `organizations` and
 * `organization_members` tables in sync. The handler is mounted BEFORE the
 * json body parser so svix can verify the raw payload signature.
 *
 * Events handled (Phase 0 scope):
 *   - user.created / user.updated
 *       Match the user's primary email to a pending organization_members row
 *       (clerk_user_id IS NULL) and stamp the row with the Clerk user id.
 *       This is the join that finally turns an invited customer into a real
 *       Clerk-backed member.
 *
 *   - organization.created
 *       Upsert an `organizations` row for the Clerk org (keyed on clerk_org_id).
 *       Used when a customer creates a new org through Clerk's hosted UI in
 *       later phases — Phase 0 invites all reuse the legacy mirrored orgs.
 *
 *   - organization.deleted
 *       Soft-mark the org by clearing clerk_org_id (we keep the row so legacy
 *       FKs stay valid). Phase 1+ will revisit the deletion model.
 *
 *   - organizationMembership.created / .deleted
 *       Maintain organization_members rows keyed on (organization_id,
 *       clerk_user_id).
 *
 * The endpoint returns 503 when CLERK_WEBHOOK_SECRET is unset so misconfigured
 * deployments fail loudly instead of silently swallowing events.
 */

import { Router, type IRouter, type Request, type Response, raw } from "express";
import { eq, and, isNull, sql } from "drizzle-orm";
import { Webhook } from "svix";
import {
  db,
  organizationsTable,
  organizationMembersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserPayload {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
}

interface ClerkOrganizationPayload {
  id: string;
  name?: string | null;
  slug?: string | null;
}

interface ClerkOrganizationMembershipPayload {
  id: string;
  role?: string | null;
  organization?: ClerkOrganizationPayload;
  public_user_data?: {
    user_id?: string | null;
    identifier?: string | null;
  };
}

interface ClerkEvent {
  type: string;
  data: unknown;
}

function primaryEmailOf(user: ClerkUserPayload): string | null {
  if (!user.email_addresses?.length) return null;
  if (user.primary_email_address_id) {
    const match = user.email_addresses.find(
      (e) => e.id === user.primary_email_address_id,
    );
    if (match) return match.email_address.toLowerCase();
  }
  return user.email_addresses[0].email_address.toLowerCase();
}

async function handleUserSync(user: ClerkUserPayload): Promise<void> {
  const email = primaryEmailOf(user);
  if (!email) return;

  // Find every pending membership row that was invited under this email and
  // hasn't yet been linked to a Clerk identity. Stamp them all — a single
  // Clerk identity may be invited into multiple orgs over time (Phase 7+).
  const updated = await db
    .update(organizationMembersTable)
    .set({
      clerkUserId: user.id,
      status: "active",
      acceptedAt: new Date(),
    })
    .where(
      and(
        sql`lower(${organizationMembersTable.email}) = ${email}`,
        isNull(organizationMembersTable.clerkUserId),
      ),
    )
    .returning({ id: organizationMembersTable.id });

  if (updated.length > 0) {
    logger.info(
      { clerkUserId: user.id, email, linked: updated.length },
      "[clerk-webhook] linked Clerk user to pending membership(s)",
    );
  }
}

async function handleOrganizationCreated(
  org: ClerkOrganizationPayload,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.clerkOrgId, org.id));
  if (existing) {
    const nextName = org.name ?? existing.name;
    const nextSlug = org.slug ?? existing.clerkOrgSlug;
    if (nextName !== existing.name || nextSlug !== existing.clerkOrgSlug) {
      await db
        .update(organizationsTable)
        .set({ name: nextName, clerkOrgSlug: nextSlug })
        .where(eq(organizationsTable.id, existing.id));
    }
    return;
  }
  await db.insert(organizationsTable).values({
    clerkOrgId: org.id,
    clerkOrgSlug: org.slug ?? null,
    name: org.name ?? org.slug ?? org.id,
    primaryEmail: "",
  });
  logger.info({ clerkOrgId: org.id }, "[clerk-webhook] created organization");
}

async function handleOrganizationDeleted(
  org: ClerkOrganizationPayload,
): Promise<void> {
  // Soft-clear the Clerk binding; keep the row so legacy FKs stay valid.
  await db
    .update(organizationsTable)
    .set({ clerkOrgId: null, clerkOrgSlug: null })
    .where(eq(organizationsTable.clerkOrgId, org.id));
}

async function handleMembershipCreated(
  m: ClerkOrganizationMembershipPayload,
): Promise<void> {
  const clerkOrgId = m.organization?.id;
  const clerkUserId = m.public_user_data?.user_id;
  const email = m.public_user_data?.identifier?.toLowerCase() ?? "";
  if (!clerkOrgId || !clerkUserId) return;

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.clerkOrgId, clerkOrgId));
  if (!org) {
    logger.warn(
      { clerkOrgId },
      "[clerk-webhook] membership for unknown org — ignoring",
    );
    return;
  }

  // Map Clerk roles. We deliberately do NOT promote anyone to "admin" from a
  // membership webhook unless Clerk explicitly says so — the role decision
  // for Phase 0 admins (e.g. Tom) lives in the legacy backfill row and must
  // be preserved by the email-stamp branch below.
  const role = m.role === "admin" ? "admin" : "developer";

  // First, try to stamp an existing legacy row that was invited under the
  // same email but hasn't been linked yet. This preserves the role assigned
  // during Phase 0 backfill (admin/owner/developer/...) and avoids a
  // unique-violation on the (organization_id, email) index that would
  // otherwise reject the insert below.
  if (email) {
    const stamped = await db
      .update(organizationMembersTable)
      .set({
        clerkUserId,
        status: "active",
        acceptedAt: new Date(),
      })
      .where(
        and(
          eq(organizationMembersTable.organizationId, org.id),
          sql`lower(${organizationMembersTable.email}) = ${email}`,
          isNull(organizationMembersTable.clerkUserId),
        ),
      )
      .returning({ id: organizationMembersTable.id });
    if (stamped.length > 0) return;
  }

  // No matching pending row → upsert by (organization_id, clerk_user_id).
  // On conflict (re-delivery or membershipUpdated event), refresh role /
  // email / status so Clerk stays the source of truth post-cutover. We do
  // NOT touch acceptedAt on the conflict path so the original accept time
  // is preserved.
  await db
    .insert(organizationMembersTable)
    .values({
      organizationId: org.id,
      clerkUserId,
      email,
      role,
      status: "active",
      acceptedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        organizationMembersTable.organizationId,
        organizationMembersTable.clerkUserId,
      ],
      set: {
        role,
        email,
        status: "active",
      },
    });
}

async function handleMembershipDeleted(
  m: ClerkOrganizationMembershipPayload,
): Promise<void> {
  const clerkOrgId = m.organization?.id;
  const clerkUserId = m.public_user_data?.user_id;
  if (!clerkOrgId || !clerkUserId) return;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.clerkOrgId, clerkOrgId));
  if (!org) return;
  await db
    .update(organizationMembersTable)
    .set({ status: "removed" })
    .where(
      and(
        eq(organizationMembersTable.organizationId, org.id),
        eq(organizationMembersTable.clerkUserId, clerkUserId),
      ),
    );
}

router.post(
  "/clerk/webhook",
  raw({ type: "application/json", limit: "1mb" }),
  async (req: Request, res: Response) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      res
        .status(503)
        .json({ error: { code: "clerk_webhook_not_configured", message: "CLERK_WEBHOOK_SECRET unset" } });
      return;
    }

    const body = req.body as Buffer;
    const headers = {
      "svix-id": req.header("svix-id") ?? "",
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    };

    let event: ClerkEvent;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(body.toString("utf8"), headers) as ClerkEvent;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        "[clerk-webhook] signature verification failed",
      );
      res.status(400).json({ error: { code: "invalid_signature" } });
      return;
    }

    try {
      switch (event.type) {
        case "user.created":
        case "user.updated":
          await handleUserSync(event.data as ClerkUserPayload);
          break;
        case "organization.created":
        case "organization.updated":
          await handleOrganizationCreated(event.data as ClerkOrganizationPayload);
          break;
        case "organization.deleted":
          await handleOrganizationDeleted(event.data as ClerkOrganizationPayload);
          break;
        case "organizationMembership.created":
        case "organizationMembership.updated":
          await handleMembershipCreated(
            event.data as ClerkOrganizationMembershipPayload,
          );
          break;
        case "organizationMembership.deleted":
          await handleMembershipDeleted(
            event.data as ClerkOrganizationMembershipPayload,
          );
          break;
        default:
          // Acknowledge unknown event types so Clerk doesn't retry forever.
          logger.debug({ type: event.type }, "[clerk-webhook] ignoring event");
      }
      res.status(200).json({ received: true });
    } catch (err) {
      // Return 500 so Clerk retries — webhook handlers must be idempotent.
      logger.error(
        { err: (err as Error).message, type: event.type },
        "[clerk-webhook] handler failed",
      );
      res.status(500).json({ error: { code: "handler_failed" } });
    }
  },
);

export default router;
