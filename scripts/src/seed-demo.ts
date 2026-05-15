/**
 * Seed a single demo organization so a fresh tenant has realistic state on
 * first boot of the portal. Idempotent — safe to re-run.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-demo.ts
 *
 * Creates / upserts:
 *   - 1 organization ("Demo Studio")
 *   - 1 owner member ("demo@machinedog.dev")
 *   - 1 starter project (blank, no template) owned by the demo org
 *   - A handful of token-ledger rows (initial grant + sample debits)
 *   - A few audit-event rows spanning sign-in / billing / build
 *   - 1 sample change-request tied to the project
 *
 * NOTE: This is *demo* data, not production data. The script writes only to
 * tables that store organization-scoped content; it does not touch Clerk or
 * Stripe. Operators wanting a "real" demo user should still create that user
 * through the normal sign-up flow.
 */

import { eq, and } from "drizzle-orm";
import {
  db,
  organizationsTable,
  organizationMembersTable,
  projectsTable,
  tokenLedgerTable,
  auditEventsTable,
  changeRequestsTable,
  templatesTable,
} from "@workspace/db";

const DEMO_ORG_NAME = "Demo Studio";
const DEMO_OWNER_EMAIL = "demo@machinedog.dev";
const DEMO_PROJECT_TITLE = "Patient intake portal";
// Real template slug seeded by `seed-templates.ts` on api-server boot.
const DEMO_TEMPLATE_SLUG = "saas-starter";

async function main(): Promise<void> {
  console.log("[seed-demo] starting…");

  // 1) Org.
  const existingOrg = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.name, DEMO_ORG_NAME))
    .limit(1);
  let org = existingOrg[0];
  if (!org) {
    const [created] = await db
      .insert(organizationsTable)
      .values({
        name: DEMO_ORG_NAME,
        primaryEmail: DEMO_OWNER_EMAIL,
        website: "https://demo.machinedog.dev",
        industry: "Healthcare",
        clientType: "healthcare",
        planType: "pro",
        planStatus: "active",
        status: "active",
        tokenBalance: 1_000_000,
        totalTokensUsed: 0,
      })
      .returning();
    org = created!;
    console.log(`[seed-demo] created org #${org.id} ${DEMO_ORG_NAME}`);
  } else {
    console.log(`[seed-demo] reusing org #${org.id} ${DEMO_ORG_NAME}`);
  }

  // 2) Owner member.
  const existingMember = await db
    .select()
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.organizationId, org.id),
        eq(organizationMembersTable.email, DEMO_OWNER_EMAIL),
      ),
    )
    .limit(1);
  let member = existingMember[0];
  if (!member) {
    const [createdMember] = await db
      .insert(organizationMembersTable)
      .values({
        organizationId: org.id,
        email: DEMO_OWNER_EMAIL,
        role: "owner",
        status: "active",
        // Demo owner has already finished onboarding so the wizard doesn't
        // hijack the demo.
        onboardingStep: 6,
        onboardingState: { plan: "pro", seeded: true },
        onboardingCompletedAt: new Date(),
      })
      .returning();
    member = createdMember!;
    console.log(`[seed-demo] created owner member #${member.id}`);
  } else {
    console.log(`[seed-demo] reusing owner member #${member.id}`);
  }

  // 3) Starter project — created from a real template so the demo workspace
  // has files to look at on first open.
  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.slug, DEMO_TEMPLATE_SLUG))
    .limit(1);
  if (!template) {
    console.warn(
      `[seed-demo] template "${DEMO_TEMPLATE_SLUG}" not found. ` +
        `Boot the api-server once so seed-templates.ts runs, then re-run.`,
    );
  }
  const existingProject = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.organizationId, org.id),
        eq(projectsTable.title, DEMO_PROJECT_TITLE),
      ),
    )
    .limit(1);
  let project = existingProject[0];
  if (!project) {
    const [createdProject] = await db
      .insert(projectsTable)
      .values({
        organizationId: org.id,
        title: DEMO_PROJECT_TITLE,
        description: template
          ? `Sample project seeded for the demo tenant from template "${template.name}". ` +
            "Ingests intake forms and writes a deidentified summary."
          : "Sample project seeded for the demo tenant. Ingests intake forms and writes a deidentified summary.",
        summary: "Patient intake portal (demo)",
        status: "active",
        ...(template ? { templateSlug: template.slug } : {}),
      })
      .returning();
    project = createdProject!;
    console.log(
      `[seed-demo] created project #${project.id} (template: ${template?.slug ?? "blank"})`,
    );
  } else {
    console.log(`[seed-demo] reusing project #${project.id}`);
  }

  // 4) Token ledger — only seed if empty for this org, otherwise idempotent.
  const ledgerExisting = await db
    .select({ id: tokenLedgerTable.id })
    .from(tokenLedgerTable)
    .where(eq(tokenLedgerTable.organizationId, org.id))
    .limit(1);
  if (ledgerExisting.length === 0) {
    await db.insert(tokenLedgerTable).values([
      {
        organizationId: org.id,
        type: "grant_signup",
        amount: 1_000_000,
        balanceAfter: 1_000_000,
        description: "Initial signup grant (seeded demo)",
        source: "system",
      },
      {
        organizationId: org.id,
        type: "deduct_ai",
        amount: -12_500,
        balanceAfter: 987_500,
        description: "Sample AI prompt session (seeded demo)",
        source: "system",
      },
      {
        organizationId: org.id,
        type: "deduct_build",
        amount: -3_200,
        balanceAfter: 984_300,
        description: "Sample build (seeded demo)",
        source: "system",
      },
    ]);
    console.log(`[seed-demo] seeded token ledger`);
  } else {
    console.log(`[seed-demo] token ledger already populated`);
  }

  // 5) Audit events.
  const auditExisting = await db
    .select({ id: auditEventsTable.id })
    .from(auditEventsTable)
    .where(eq(auditEventsTable.organizationId, org.id))
    .limit(1);
  if (auditExisting.length === 0) {
    await db.insert(auditEventsTable).values([
      {
        organizationId: org.id,
        actorEmail: DEMO_OWNER_EMAIL,
        category: "auth",
        action: "signin",
        metadata: { note: "Owner signed in via Clerk (seeded)" },
      },
      {
        organizationId: org.id,
        actorEmail: DEMO_OWNER_EMAIL,
        category: "billing",
        action: "plan_changed",
        metadata: { plan: "pro", note: "Selected Pro plan during onboarding (seeded)" },
      },
      {
        organizationId: org.id,
        projectId: project.id,
        actorEmail: DEMO_OWNER_EMAIL,
        category: "build",
        action: "build_succeeded",
        metadata: { projectTitle: project.title, note: "Seeded demo build" },
      },
    ]);
    console.log(`[seed-demo] seeded audit events`);
  } else {
    console.log(`[seed-demo] audit events already populated`);
  }

  // 6) Change request.
  const crExisting = await db
    .select({ id: changeRequestsTable.id })
    .from(changeRequestsTable)
    .where(eq(changeRequestsTable.projectId, project.id))
    .limit(1);
  if (crExisting.length === 0) {
    await db.insert(changeRequestsTable).values({
      projectId: project.id,
      organizationId: org.id,
      title: "Add SMS reminders to intake confirmation",
      rawRequest:
        "Customer wants a follow-up SMS 24h before the appointment. Twilio integration is available; needs copy + opt-out flow.",
      status: "draft",
    });
    console.log(`[seed-demo] seeded sample change request`);
  } else {
    console.log(`[seed-demo] change requests already populated`);
  }

  console.log("[seed-demo] done.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed-demo] failed:", err);
    process.exit(1);
  },
);
