import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  projectSecretsTable,
  type ProjectSecret,
} from "@workspace/db";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";
import {
  encryptSecret,
  maskedPreview,
} from "../lib/encryption";
import { recordAuditEventAsync, reqAuditMeta } from "../lib/audit";
import { scanForPhi } from "../lib/ai-phi-guard";

const router: IRouter = Router();

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SECRET_VALUE_MAX = 16 * 1024;

interface OwnerProject {
  id: number;
  organizationId: number;
  healthcareMode: boolean;
  phiAllowed: boolean;
}

async function loadOwnerProject(
  projectId: number,
  clientId: number,
  clientEmail: string,
): Promise<OwnerProject | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;
  if (project.organizationId === clientId) return project;
  // Owner-only — collaborators cannot view or write secrets even if the
  // project shares them. Phase 7 admin can extend this.
  const [member] = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.status, "active"),
        eq(projectMembersTable.email, clientEmail.toLowerCase()),
      ),
    );
  if (member && member.role === "owner") return project;
  return null;
}

function toApiSecret(row: ProjectSecret) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    environment: row.environment,
    valuePreview: row.valuePreview,
    version: row.version,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdByEmail: row.createdByEmail,
    updatedByEmail: row.updatedByEmail,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get(
  "/projects/:id/secrets",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadOwnerProject(projectId, req.dbClient!.id, req.dbClient!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(projectSecretsTable)
      .where(eq(projectSecretsTable.projectId, projectId))
      .orderBy(desc(projectSecretsTable.updatedAt));
    res.json({ data: rows.map(toApiSecret) });
  },
);

router.post(
  "/projects/:id/secrets",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadOwnerProject(projectId, req.dbClient!.id, req.dbClient!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const name = String(req.body?.name ?? "").trim();
    const environment = String(req.body?.environment ?? "development");
    const value = typeof req.body?.value === "string" ? req.body.value : "";
    if (!SECRET_NAME_RE.test(name)) {
      res.status(400).json({
        error: "Secret name must be UPPER_SNAKE_CASE (start with a letter, ≤64 chars).",
      });
      return;
    }
    if (!["development", "staging", "production"].includes(environment)) {
      res.status(400).json({ error: "Invalid environment" });
      return;
    }
    if (!value || value.length > SECRET_VALUE_MAX) {
      res.status(400).json({ error: "Value required and must be ≤16 KiB" });
      return;
    }
    if (!project.phiAllowed) {
      const phi = scanForPhi(value);
      if (phi.blocked) {
        recordAuditEventAsync({
          organizationId: project.organizationId,
          projectId: project.id,
          actorOrganizationId: req.dbClient!.id,
          actorEmail: req.dbClient!.email,
          category: "phi",
          action: "phi_blocked",
          targetType: "project_secret",
          targetId: name,
          metadata: {
            stage: "secret_create",
            rules: phi.hits.map((h) => h.rule),
            contentLength: value.length,
          },
          ...reqAuditMeta(req),
        });
        res.status(400).json({
          error:
            "This value looks like protected health information (PHI). Storing PHI is blocked unless your project has BAA-backed PHI handling enabled.",
          code: "phi_blocked",
          rules: phi.hits.map((h) => h.rule),
          labels: phi.hits.map((h) => h.label),
        });
        return;
      }
    }

    const enc = encryptSecret(value);
    try {
      const [row] = await db
        .insert(projectSecretsTable)
        .values({
          organizationId: project.organizationId,
          projectId: project.id,
          name,
          environment: environment as "development" | "staging" | "production",
          encryptedValue: enc.encryptedValue,
          nonce: enc.nonce,
          authTag: enc.authTag,
          valuePreview: maskedPreview(value),
          version: 1,
          createdBy: req.clerkAuth?.userId ?? null,
          updatedBy: req.clerkAuth?.userId ?? null,
          createdByEmail: req.dbClient!.email,
          updatedByEmail: req.dbClient!.email,
        })
        .returning();
      recordAuditEventAsync({
        organizationId: project.organizationId,
        projectId: project.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "secret",
        action: "secret_created",
        targetType: "project_secret",
        targetId: String(row.id),
        metadata: { name, environment },
        ...reqAuditMeta(req),
      });
      res.status(201).json(toApiSecret(row));
    } catch (err: unknown) {
      // Unique-violation on (projectId, environment, name)
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        res.status(409).json({
          error: `Secret "${name}" already exists in ${environment}. Use update or rotate instead.`,
          code: "secret_already_exists",
        });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/projects/:id/secrets/:secretId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const secretId = Number(req.params.secretId);
    if (!Number.isFinite(projectId) || !Number.isFinite(secretId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await loadOwnerProject(projectId, req.dbClient!.id, req.dbClient!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body ?? {};
    const newName =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    const newEnv =
      body.environment === "development" ||
      body.environment === "staging" ||
      body.environment === "production"
        ? (body.environment as "development" | "staging" | "production")
        : null;
    const value = typeof body.value === "string" ? body.value : null;
    if (!newName && !newEnv && value == null) {
      res.status(400).json({ error: "Provide name, environment, and/or value" });
      return;
    }
    if (value != null && (value.length === 0 || value.length > SECRET_VALUE_MAX)) {
      res.status(400).json({ error: "Value must be 1..16 KiB when provided" });
      return;
    }
    const [existing] = await db
      .select()
      .from(projectSecretsTable)
      .where(
        and(
          eq(projectSecretsTable.id, secretId),
          eq(projectSecretsTable.projectId, projectId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (value != null && !project.phiAllowed) {
      const phi = scanForPhi(value);
      if (phi.blocked) {
        recordAuditEventAsync({
          organizationId: project.organizationId,
          projectId: project.id,
          actorOrganizationId: req.dbClient!.id,
          actorEmail: req.dbClient!.email,
          category: "phi",
          action: "phi_blocked",
          targetType: "project_secret",
          targetId: String(secretId),
          metadata: {
            stage: "secret_update",
            rules: phi.hits.map((h) => h.rule),
            contentLength: value.length,
          },
          ...reqAuditMeta(req),
        });
        res.status(400).json({
          error:
            "This value looks like protected health information (PHI). Storing PHI is blocked unless your project has BAA-backed PHI handling enabled.",
          code: "phi_blocked",
          rules: phi.hits.map((h) => h.rule),
          labels: phi.hits.map((h) => h.label),
        });
        return;
      }
    }
    const setPatch: Record<string, unknown> = {
      updatedBy: req.clerkAuth?.userId ?? null,
      updatedByEmail: req.dbClient!.email,
    };
    if (newName) setPatch.name = newName;
    if (newEnv) setPatch.environment = newEnv;
    if (value != null) {
      const enc = encryptSecret(value);
      setPatch.encryptedValue = enc.encryptedValue;
      setPatch.nonce = enc.nonce;
      setPatch.authTag = enc.authTag;
      setPatch.valuePreview = maskedPreview(value);
      setPatch.version = sql`${projectSecretsTable.version} + 1`;
    }
    const [row] = await db
      .update(projectSecretsTable)
      .set(setPatch)
      .where(eq(projectSecretsTable.id, secretId))
      .returning();
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "secret",
      action: "secret_updated",
      targetType: "project_secret",
      targetId: String(row.id),
      metadata: { name: row.name, environment: row.environment, version: row.version },
      ...reqAuditMeta(req),
    });
    res.json(toApiSecret(row));
  },
);

router.post(
  "/projects/:id/secrets/:secretId/rotate",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const secretId = Number(req.params.secretId);
    if (!Number.isFinite(projectId) || !Number.isFinite(secretId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await loadOwnerProject(projectId, req.dbClient!.id, req.dbClient!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const value = typeof req.body?.value === "string" ? req.body.value : "";
    if (!value || value.length > SECRET_VALUE_MAX) {
      res.status(400).json({ error: "Value required" });
      return;
    }
    if (!project.phiAllowed) {
      const phi = scanForPhi(value);
      if (phi.blocked) {
        recordAuditEventAsync({
          organizationId: project.organizationId,
          projectId: project.id,
          actorOrganizationId: req.dbClient!.id,
          actorEmail: req.dbClient!.email,
          category: "phi",
          action: "phi_blocked",
          targetType: "project_secret",
          targetId: String(secretId),
          metadata: {
            stage: "secret_rotate",
            rules: phi.hits.map((h) => h.rule),
            contentLength: value.length,
          },
          ...reqAuditMeta(req),
        });
        res.status(400).json({
          error:
            "This value looks like protected health information (PHI). Rotation blocked.",
          code: "phi_blocked",
          rules: phi.hits.map((h) => h.rule),
        });
        return;
      }
    }
    const enc = encryptSecret(value);
    const [row] = await db
      .update(projectSecretsTable)
      .set({
        encryptedValue: enc.encryptedValue,
        nonce: enc.nonce,
        authTag: enc.authTag,
        valuePreview: maskedPreview(value),
        version: sql`${projectSecretsTable.version} + 1`,
        updatedBy: req.clerkAuth?.userId ?? null,
        updatedByEmail: req.dbClient!.email,
      })
      .where(
        and(
          eq(projectSecretsTable.id, secretId),
          eq(projectSecretsTable.projectId, projectId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "secret",
      action: "secret_rotated",
      targetType: "project_secret",
      targetId: String(row.id),
      metadata: { name: row.name, environment: row.environment, version: row.version },
      ...reqAuditMeta(req),
    });
    res.json(toApiSecret(row));
  },
);

router.delete(
  "/projects/:id/secrets/:secretId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const secretId = Number(req.params.secretId);
    if (!Number.isFinite(projectId) || !Number.isFinite(secretId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await loadOwnerProject(projectId, req.dbClient!.id, req.dbClient!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [existing] = await db
      .select()
      .from(projectSecretsTable)
      .where(
        and(
          eq(projectSecretsTable.id, secretId),
          eq(projectSecretsTable.projectId, projectId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db.delete(projectSecretsTable).where(eq(projectSecretsTable.id, secretId));
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "secret",
      action: "secret_deleted",
      targetType: "project_secret",
      targetId: String(secretId),
      metadata: { name: existing.name, environment: existing.environment },
      ...reqAuditMeta(req),
    });
    res.status(204).end();
  },
);

export default router;
