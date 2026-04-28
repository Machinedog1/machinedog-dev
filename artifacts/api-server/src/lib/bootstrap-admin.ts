import { db, clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./passwords";
import { logger } from "./logger";

/**
 * One-shot admin bootstrap. Runs at API server startup. If both
 * BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are present, ensures a
 * client row exists for that email with admin=true and the given password.
 *
 * Idempotent — safe to run on every boot. Useful for first-deploy admin
 * provisioning into an empty production database.
 */
export async function bootstrapAdmin(): Promise<void> {
  const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!rawEmail || !rawPassword) {
    return;
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    logger.warn({ email: rawEmail }, "BOOTSTRAP_ADMIN_EMAIL is not a valid email; skipping");
    return;
  }
  if (rawPassword.length < 8) {
    logger.warn("BOOTSTRAP_ADMIN_PASSWORD is too short (min 8 chars); skipping");
    return;
  }

  try {
    const passwordHash = await hashPassword(rawPassword);
    const [existing] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.email, email));

    if (existing) {
      await db
        .update(clientsTable)
        .set({
          passwordHash,
          status: "active",
          isAdmin: true,
          updatedAt: new Date(),
        })
        .where(eq(clientsTable.id, existing.id));
      logger.info({ email, action: "updated" }, "Bootstrap admin updated");
    } else {
      await db.insert(clientsTable).values({
        email,
        passwordHash,
        status: "active",
        isAdmin: true,
        tokenBalance: 1_000_000,
        totalTokensUsed: 0,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      });
      logger.info({ email, action: "created" }, "Bootstrap admin created");
    }
  } catch (err) {
    logger.error({ err }, "bootstrapAdmin failed");
  }
}
