/**
 * Phase 0 cutover step: send a Clerk invitation to every active org member
 * who hasn't yet linked their Clerk identity.
 *
 * Idempotent — skips members where `clerk_user_id` is already set. Re-running
 * after partial failures only invites the remaining members. When run with
 * `--dry-run` it prints the invite plan without contacting Clerk.
 *
 * Requirements:
 *   - CLERK_SECRET_KEY  (Clerk Backend API access)
 *   - PUBLIC_APP_URL    (used as the post-sign-in redirect target; falls back
 *                        to REPLIT_DEV_DOMAIN, then https://machinedog.dev)
 *
 * Run with:
 *   pnpm tsx scripts/src/invite-clients-to-clerk.ts            # send invites
 *   pnpm tsx scripts/src/invite-clients-to-clerk.ts --dry-run  # preview only
 */

import { eq, isNull, and } from "drizzle-orm";
import {
  db,
  organizationMembersTable,
  organizationsTable,
} from "@workspace/db";

interface ClerkInvitationsClient {
  createInvitation(args: {
    emailAddress: string;
    redirectUrl?: string;
    publicMetadata?: Record<string, unknown>;
    notify?: boolean;
    ignoreExisting?: boolean;
  }): Promise<{ id: string; emailAddress: string; status: string }>;
}

function getRedirectUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "") + "/sign-in";
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/sign-in`;
  return "https://machinedog.dev/sign-in";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.CLERK_SECRET_KEY && !dryRun) {
    console.error("[invite-clients] CLERK_SECRET_KEY is required (use --dry-run to preview)");
    process.exit(1);
  }

  // Lazy-import the Clerk client so --dry-run works without the env var.
  let invitations: ClerkInvitationsClient | null = null;
  if (!dryRun) {
    const mod = await import("@clerk/express");
    invitations = mod.clerkClient.invitations as unknown as ClerkInvitationsClient;
  }

  const redirectUrl = getRedirectUrl();
  console.log(`[invite-clients] redirect URL: ${redirectUrl}`);

  // Pull every member that's still missing a Clerk identity. Join in the org
  // so we can attach helpful metadata to the invitation.
  const rows = await db
    .select({
      memberId: organizationMembersTable.id,
      email: organizationMembersTable.email,
      role: organizationMembersTable.role,
      organizationId: organizationMembersTable.organizationId,
      organizationName: organizationsTable.name,
    })
    .from(organizationMembersTable)
    .innerJoin(
      organizationsTable,
      eq(organizationMembersTable.organizationId, organizationsTable.id),
    )
    .where(
      and(
        isNull(organizationMembersTable.clerkUserId),
        // Only invite memberships that aren't already removed.
        eq(organizationMembersTable.status, "active"),
      ),
    );

  console.log(`[invite-clients] ${rows.length} member(s) need an invite`);
  if (rows.length === 0) {
    await db.$client.end();
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `${row.email} → ${row.organizationName} (${row.role})`;
    if (dryRun) {
      console.log(`[invite-clients] [dry-run] would invite ${label}`);
      continue;
    }
    try {
      await invitations!.createInvitation({
        emailAddress: row.email,
        redirectUrl,
        // Stash the join target on the invitation so the webhook (or a future
        // accept-handler) can route the user to the right org/role.
        publicMetadata: {
          organizationId: row.organizationId,
          membershipRole: row.role,
          source: "phase0-migration",
        },
        notify: true,
        // Don't blow up if Clerk already has a pending invite for this email
        // — we want the script to be idempotent across re-runs.
        ignoreExisting: true,
      });
      sent++;
      console.log(`[invite-clients] invited ${label}`);
    } catch (err) {
      failed++;
      console.error(
        `[invite-clients] failed ${label}: ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `[invite-clients] DONE — sent=${sent} failed=${failed}` +
      (dryRun ? " (dry-run)" : ""),
  );
  await db.$client.end();
}

main().catch((err) => {
  console.error("[invite-clients] fatal", err);
  process.exit(1);
});
