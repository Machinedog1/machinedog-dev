/**
 * Auth surface — Clerk-only after the cutover.
 *
 * Exposes:
 *   - GET  /auth/me                 — resolve active org + member.
 *   - PATCH /auth/me/onboarding     — per-member wizard step state. Any active
 *                                     member may write their own progress;
 *                                     org-profile fields (name, website,
 *                                     industry, clientType) are gated to
 *                                     owner/admin members only.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  organizationsTable,
  organizationMembersTable,
  type Organization,
  type OrganizationMember,
} from "@workspace/db";
import { requireAuth, isOrgAdmin } from "../lib/auth";

const router: IRouter = Router();

function meResponse(org: Organization, member: OrganizationMember) {
  return {
    organization: {
      id: org.id,
      name: org.name,
      primaryEmail: org.primaryEmail,
      website: org.website ?? null,
      industry: org.industry ?? null,
      clientType: org.clientType ?? null,
      planType: org.planType,
      planStatus: org.planStatus,
      status: org.status,
      tokenBalance: org.tokenBalance,
      totalTokensUsed: org.totalTokensUsed,
      stripeCustomerId: org.stripeCustomerId,
      portalSubscriptionStatus: org.portalSubscriptionStatus,
      portalCurrentPeriodEnd: org.portalCurrentPeriodEnd,
      clerkOrgId: org.clerkOrgId,
    },
    member: {
      id: member.id,
      email: member.email,
      role: member.role,
      isAdmin: isOrgAdmin(member),
      status: member.status,
      onboardingStep: member.onboardingStep ?? 0,
      onboardingState: member.onboardingState ?? null,
      onboardingCompletedAt: member.onboardingCompletedAt,
    },
  };
}

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(meResponse(req.organization!, req.organizationMember!));
});

const OnboardingPatchBody = z.object({
  step: z.number().int().min(0).max(6).optional(),
  // Org-profile fields — admin/owner only.
  name: z.string().min(1).max(120).optional(),
  website: z.string().max(500).nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  clientType: z
    .enum(["agency", "startup", "enterprise", "healthcare", "consultancy", "other"])
    .nullable()
    .optional(),
  // Per-member free-form state (merged into existing).
  state: z.record(z.string(), z.unknown()).optional(),
  // Mark this member's wizard as complete.
  complete: z.boolean().optional(),
});

router.patch("/auth/me/onboarding", requireAuth, async (req, res): Promise<void> => {
  const parsed = OnboardingPatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const member = req.organizationMember!;
  const org = req.organization!;

  // Org-profile fields require owner/admin. Any member can save their own
  // wizard progress and submit org fields (the wizard always sends them on
  // step 1), but the server only writes to the organizations row when the
  // caller is an owner/admin. Non-admins still advance through the wizard
  // — their submitted values are echoed back into per-member state so they
  // aren't lost, but the org row is left untouched.
  const wantsOrgChange =
    data.name !== undefined ||
    data.website !== undefined ||
    data.industry !== undefined ||
    data.clientType !== undefined;
  const canEditOrg = isOrgAdmin(member);
  if (wantsOrgChange && canEditOrg) {
    const orgPatch: Record<string, unknown> = {};
    if (data.name !== undefined) orgPatch.name = data.name.trim();
    if (data.website !== undefined) orgPatch.website = data.website ? data.website.trim() : null;
    if (data.industry !== undefined)
      orgPatch.industry = data.industry ? data.industry.trim() : null;
    if (data.clientType !== undefined) orgPatch.clientType = data.clientType;
    if (Object.keys(orgPatch).length > 0) {
      await db.update(organizationsTable).set(orgPatch).where(eq(organizationsTable.id, org.id));
    }
  }

  // Apply per-member onboarding patch.
  const memberPatch: Record<string, unknown> = {};
  if (data.step !== undefined) memberPatch.onboardingStep = data.step;

  // Echo any submitted org-profile fields into the member's own
  // onboardingState. For owner/admins this is just a convenience cache;
  // for non-admins it preserves what they typed in step 1 so resuming
  // the wizard re-populates the form (the org row itself stays
  // role-gated, as enforced above).
  const echoedOrgFields: Record<string, unknown> = {};
  if (data.name !== undefined) echoedOrgFields.name = data.name;
  if (data.website !== undefined) echoedOrgFields.website = data.website;
  if (data.industry !== undefined) echoedOrgFields.industry = data.industry;
  if (data.clientType !== undefined) echoedOrgFields.clientType = data.clientType;

  if (data.state !== undefined || Object.keys(echoedOrgFields).length > 0) {
    const merged = {
      ...((member.onboardingState as Record<string, unknown> | null) ?? {}),
      ...echoedOrgFields,
      ...(data.state ?? {}),
    };
    memberPatch.onboardingState = merged;
  }
  if (data.complete) {
    memberPatch.onboardingCompletedAt = new Date();
    memberPatch.onboardingStep = 6;
  }
  if (Object.keys(memberPatch).length > 0) {
    await db
      .update(organizationMembersTable)
      .set(memberPatch)
      .where(eq(organizationMembersTable.id, member.id));
  }

  // Re-read both rows so the response reflects committed state.
  const [updatedOrg] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, org.id))
    .limit(1);
  const [updatedMember] = await db
    .select()
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.id, member.id))
    .limit(1);

  res.json(meResponse(updatedOrg!, updatedMember!));
});

export default router;
