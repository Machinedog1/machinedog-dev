/**
 * Phase 0 foundation backfill: mirror every existing `clients` row into a
 * matching `organizations` row + `organization_members` row, then populate
 * the new nullable `organization_id` columns on dependent tables.
 *
 * Idempotent: re-running is a no-op for rows that already have an org.
 *
 * Run with:  pnpm tsx scripts/src/backfill-organizations.ts
 */

import { eq, isNull, and, sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  organizationsTable,
  organizationMembersTable,
  projectsTable,
  changeRequestsTable,
  projectMembersTable,
  promptSessionsTable,
  tokenPurchasesTable,
} from "@workspace/db";

async function main() {
  console.log("[phase0-backfill] starting");

  const clients = await db.select().from(clientsTable);
  console.log(`[phase0-backfill] found ${clients.length} clients to mirror`);

  let createdOrgs = 0;
  let createdMembers = 0;

  for (const c of clients) {
    // Org mirror — keyed off legacyClientId for idempotency.
    const [existingOrg] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.legacyClientId, c.id));

    let orgId: number;
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const [inserted] = await db
        .insert(organizationsTable)
        .values({
          legacyClientId: c.id,
          name: c.email,
          primaryEmail: c.email,
          stripeCustomerId: c.stripeCustomerId ?? null,
          // Plan placeholders — Phase 1 will replace these.
          planType: "free",
          planStatus: c.portalSubscriptionStatus === "active" ? "active" : "none",
          baaStatus: "not_required",
        })
        .returning();
      orgId = inserted.id;
      createdOrgs++;
    }

    // Membership mirror.
    const [existingMember] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.organizationId, orgId),
          eq(organizationMembersTable.legacyClientId, c.id),
        ),
      );
    if (!existingMember) {
      await db.insert(organizationMembersTable).values({
        organizationId: orgId,
        legacyClientId: c.id,
        clerkUserId: null,
        email: c.email,
        // Owner role — admin flag is mirrored separately on the legacy
        // clients table; Phase 0 still uses that for global admin checks.
        role: c.isAdmin ? "admin" : "owner",
        status: c.status === "active" ? "active" : "pending",
        acceptedAt: c.status === "active" ? new Date() : null,
      });
      createdMembers++;
    }
  }
  console.log(
    `[phase0-backfill] created ${createdOrgs} organizations, ${createdMembers} memberships`,
  );

  // Backfill organization_id on dependent tables. Each is a single SQL
  // UPDATE that uses the legacy client_id → organizations.legacy_client_id
  // mapping. Only rows where organization_id IS NULL are touched, so it's
  // safe to re-run.

  const updateSql = (table: string, fkColumn: string) => sql.raw(`
    UPDATE ${table} t
    SET organization_id = o.id
    FROM organizations o
    WHERE o.legacy_client_id = t.${fkColumn}
      AND t.organization_id IS NULL
  `);

  await db.execute(updateSql("projects", "client_id"));
  console.log("[phase0-backfill] projects.organization_id backfilled");

  // change_requests.requester_client_id → organization_id
  await db.execute(updateSql("change_requests", "requester_client_id"));
  console.log("[phase0-backfill] change_requests.organization_id backfilled");

  // project_members.client_id may be null (pending invites with no account
  // yet). Those rows stay null until the invite is accepted; new code paths
  // can fall back to the parent project's organization_id.
  await db.execute(sql.raw(`
    UPDATE project_members pm
    SET organization_id = p.organization_id
    FROM projects p
    WHERE p.id = pm.project_id
      AND pm.organization_id IS NULL
      AND p.organization_id IS NOT NULL
  `));
  console.log("[phase0-backfill] project_members.organization_id backfilled");

  await db.execute(updateSql("prompt_sessions", "client_id"));
  console.log("[phase0-backfill] prompt_sessions.organization_id backfilled");

  await db.execute(updateSql("token_purchases", "client_id"));
  console.log("[phase0-backfill] token_purchases.organization_id backfilled");

  // Sanity report
  const [report] = await db
    .select({
      totalClients: sql<number>`(SELECT COUNT(*)::int FROM clients)`,
      totalOrgs: sql<number>`(SELECT COUNT(*)::int FROM organizations)`,
      totalMembers: sql<number>`(SELECT COUNT(*)::int FROM organization_members)`,
      projectsMissing: sql<number>`(SELECT COUNT(*)::int FROM projects WHERE organization_id IS NULL)`,
      crsMissing: sql<number>`(SELECT COUNT(*)::int FROM change_requests WHERE organization_id IS NULL)`,
    })
    .from(clientsTable)
    .limit(1);
  console.log("[phase0-backfill] DONE", report);
  await db.$client.end();
}

main().catch((err) => {
  console.error("[phase0-backfill] failed", err);
  process.exit(1);
});
