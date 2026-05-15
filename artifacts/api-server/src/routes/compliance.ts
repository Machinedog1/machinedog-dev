/**
 * Phase 8 — per-organization compliance posture endpoints.
 *
 * Backs the in-app `/compliance` page. Owners and admins of an org can
 * inspect every server-side precondition for healthcare/PHI mode, update
 * the operational checklist (risk analysis, IR, backup, retention) and
 * file a "request review" event for an operator to act on. The route is
 * read-only for non-owners.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  organizationsTable,
  projectsTable,
  complianceProfilesTable,
  type ComplianceProfile,
  type Organization,
} from "@workspace/db";
import {
  GetMyComplianceProfileResponse,
  UpdateMyComplianceProfileBody,
  RequestComplianceReviewBody,
  RequestComplianceReviewResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  requireOrgOwnerOrAdmin,
} from "../lib/auth";
import { recordAuditEventAsync, reqAuditMeta } from "../lib/audit";
import { PHI_MODE_LOCKED_WARNING } from "../lib/compliance-warnings";

const router: IRouter = Router();

async function getOrCreateProfile(
  organizationId: number,
): Promise<ComplianceProfile> {
  const [existing] = await db
    .select()
    .from(complianceProfilesTable)
    .where(eq(complianceProfilesTable.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(complianceProfilesTable)
    .values({ organizationId })
    .returning();
  return created;
}

function evaluatePhiPreconditions(
  org: Organization,
  profile: ComplianceProfile,
): string[] {
  const failed: string[] = [];
  if (org.planType !== "healthcare" && org.planType !== "enterprise") {
    failed.push(
      `org.planType must be healthcare or enterprise (is ${org.planType})`,
    );
  }
  if (org.baaStatus !== "active") {
    failed.push(`org.baaStatus must be active (is ${org.baaStatus})`);
  }
  if (org.hipaaDeploymentStatus !== "approved") {
    failed.push(
      `org.hipaaDeploymentStatus must be approved (is ${org.hipaaDeploymentStatus})`,
    );
  }
  if (Number(org.mfaRequired) <= 0) {
    failed.push("org.mfaRequired must be true (MFA enforcement enabled)");
  }
  if (!profile.auditLoggingEnabled) {
    failed.push("compliance.auditLoggingEnabled must be true");
  }
  return failed;
}

function serializeProfile(org: Organization, profile: ComplianceProfile) {
  const failed = evaluatePhiPreconditions(org, profile);
  return {
    organizationId: org.id,
    planType: org.planType,
    baaStatus: org.baaStatus,
    hipaaDeploymentStatus: org.hipaaDeploymentStatus,
    mfaRequired: Number(org.mfaRequired) > 0,
    healthcareEnabled: profile.healthcareEnabled,
    phiAllowed: profile.phiAllowed,
    auditLoggingEnabled: profile.auditLoggingEnabled,
    auditRequired: profile.auditRequired,
    hipaaDeploymentRequired: profile.hipaaDeploymentRequired,
    awsHipaaEnvironmentStatus: profile.awsHipaaEnvironmentStatus as
      | "not_configured"
      | "pending"
      | "active"
      | "revoked",
    riskAnalysisStatus: profile.riskAnalysisStatus,
    incidentResponseStatus: profile.incidentResponseStatus,
    backupPolicyStatus: profile.backupPolicyStatus,
    dataRetentionPolicyStatus: profile.dataRetentionPolicyStatus,
    notes: profile.notes,
    lastReviewedAt: profile.lastReviewedAt
      ? profile.lastReviewedAt.toISOString()
      : null,
    lastReviewedByEmail: profile.lastReviewedByEmail,
    phiModeUnlocked: failed.length === 0,
    failedPreconditions: failed,
    warningCopy: PHI_MODE_LOCKED_WARNING,
  };
}

router.get(
  "/compliance/me",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const organizationId = req.dbClient!.id;
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId));
    if (!org) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const profile = await getOrCreateProfile(organizationId);
    // Mirror project-level toggles into the profile snapshot so the UI can
    // surface "this org has at least one PHI-enabled project" even if the
    // operator hasn't toggled the org-level flag yet.
    const projects = await db
      .select({
        healthcareMode: projectsTable.healthcareMode,
        phiAllowed: projectsTable.phiAllowed,
      })
      .from(projectsTable)
      .where(eq(projectsTable.organizationId, organizationId));
    const anyHealthcare = projects.some((p) => p.healthcareMode);
    const anyPhi = projects.some((p) => p.phiAllowed);
    const merged: ComplianceProfile = {
      ...profile,
      healthcareEnabled: profile.healthcareEnabled || anyHealthcare,
      phiAllowed: profile.phiAllowed || anyPhi,
    };
    res.json(GetMyComplianceProfileResponse.parse(serializeProfile(org, merged)));
  },
);

router.patch(
  "/compliance/me",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  requireOrgOwnerOrAdmin,
  async (req, res): Promise<void> => {
    const body = UpdateMyComplianceProfileBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const organizationId = req.dbClient!.id;
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId));
    if (!org) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const profile = await getOrCreateProfile(organizationId);
    const update: Partial<ComplianceProfile> = {
      lastReviewedAt: new Date(),
      lastReviewedByEmail: req.dbClient!.email,
    };
    if (body.data.riskAnalysisStatus !== undefined)
      update.riskAnalysisStatus = body.data.riskAnalysisStatus;
    if (body.data.incidentResponseStatus !== undefined)
      update.incidentResponseStatus = body.data.incidentResponseStatus;
    if (body.data.backupPolicyStatus !== undefined)
      update.backupPolicyStatus = body.data.backupPolicyStatus;
    if (body.data.dataRetentionPolicyStatus !== undefined)
      update.dataRetentionPolicyStatus = body.data.dataRetentionPolicyStatus;
    if (body.data.auditLoggingEnabled !== undefined)
      update.auditLoggingEnabled = body.data.auditLoggingEnabled;
    if (body.data.notes !== undefined) update.notes = body.data.notes;

    const [updated] = await db
      .update(complianceProfilesTable)
      .set(update)
      .where(eq(complianceProfilesTable.id, profile.id))
      .returning();

    recordAuditEventAsync({
      organizationId,
      actorOrganizationId: organizationId,
      actorEmail: req.dbClient!.email,
      category: "compliance",
      action: "compliance_updated",
      targetType: "organization",
      targetId: String(organizationId),
      metadata: { fields: Object.keys(body.data) },
      ...reqAuditMeta(req),
    });

    res.json(GetMyComplianceProfileResponse.parse(serializeProfile(org, updated)));
  },
);

router.post(
  "/compliance/me/request-review",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  requireOrgOwnerOrAdmin,
  async (req, res): Promise<void> => {
    const body = RequestComplianceReviewBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const organizationId = req.dbClient!.id;
    recordAuditEventAsync({
      organizationId,
      actorOrganizationId: organizationId,
      actorEmail: req.dbClient!.email,
      category: "compliance",
      action: "healthcare_mode_requested",
      targetType: "organization",
      targetId: String(organizationId),
      metadata: {
        message: body.data.message ?? null,
      },
      ...reqAuditMeta(req),
    });
    res.json(RequestComplianceReviewResponse.parse({ ok: true }));
  },
);

export default router;
