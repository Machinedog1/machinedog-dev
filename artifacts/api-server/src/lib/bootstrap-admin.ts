import { db, organizationsTable, organizationMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

/**
 * One-shot admin bootstrap. If BOOTSTRAP_ADMIN_EMAIL is set, ensures an
 * `organizations` row exists for that admin user with an `organization_members`
 * row marked role=admin so the email can be promoted to admin via Clerk
 * webhook on first sign-in. Idempotent.
 *
 * Note: passwords are no longer used (Clerk owns identity). We just provision
 * the org + admin membership shell so the user can sign in.
 */
export async function bootstrapAdmin(): Promise<void> {
  const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!rawEmail) return;

  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    logger.warn({ email: rawEmail }, "BOOTSTRAP_ADMIN_EMAIL is not a valid email; skipping");
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.email, email));

    if (existing) {
      if (existing.role !== "admin") {
        await db
          .update(organizationMembersTable)
          .set({ role: "admin", status: "active" })
          .where(eq(organizationMembersTable.id, existing.id));
        logger.info({ email, action: "promoted" }, "Bootstrap admin promoted to admin");
      }
      return;
    }

    // Create a personal admin org + membership shell.
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: `${email} (admin)`,
        primaryEmail: email,
        planType: "enterprise",
        planStatus: "active",
        status: "active",
        tokenBalance: 1_000_000,
      })
      .returning();
    await db.insert(organizationMembersTable).values({
      organizationId: org.id,
      email,
      role: "admin",
      status: "active",
    });
    logger.info({ email, orgId: org.id, action: "created" }, "Bootstrap admin org created");
  } catch (err) {
    logger.error({ err }, "bootstrapAdmin failed");
  }
}
