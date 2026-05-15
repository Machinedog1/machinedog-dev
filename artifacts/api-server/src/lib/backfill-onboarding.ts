import { and, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { db, organizationMembersTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Phase 9 cutover timestamp. Members whose `acceptedAt` is strictly
 * before this moment predate the onboarding wizard and are treated as
 * already-onboarded so they aren't hijacked into the new flow on their
 * next sign-in. New members (acceptedAt >= cutover) are never touched
 * by this backfill, no matter how many times the server restarts.
 */
export const ONBOARDING_CUTOVER = new Date("2026-05-15T00:00:00Z");

/**
 * Phase 9 one-time backfill: stamp `onboardingCompletedAt` on every
 * pre-cutover active member that doesn't already have it. Bounded by
 * `ONBOARDING_CUTOVER`, so this is effectively idempotent and cannot
 * affect any member created after the Phase 9 deploy — even if it runs
 * on every server boot.
 */
export async function backfillLegacyOnboarding(): Promise<void> {
  try {
    const result = await db
      .update(organizationMembersTable)
      .set({
        onboardingCompletedAt: sql`COALESCE(${organizationMembersTable.acceptedAt}, ${ONBOARDING_CUTOVER})`,
      })
      .where(
        and(
          isNotNull(organizationMembersTable.acceptedAt),
          lt(organizationMembersTable.acceptedAt, ONBOARDING_CUTOVER),
          isNull(organizationMembersTable.onboardingCompletedAt),
        ),
      )
      .returning({ id: organizationMembersTable.id });
    if (result.length > 0) {
      logger.info(
        { count: result.length, cutover: ONBOARDING_CUTOVER.toISOString() },
        "backfillLegacyOnboarding: marked pre-cutover members as onboarded",
      );
    }
  } catch (err) {
    logger.error({ err }, "backfillLegacyOnboarding threw");
  }
}
