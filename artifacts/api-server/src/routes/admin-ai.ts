/**
 * Phase 4 — Admin AI registry routes. Mounted under /api/admin/ai/*.
 * All routes require admin.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  aiProvidersTable,
  aiModelsTable,
  aiUsageTable,
  AI_MODEL_CATEGORIES,
  type AiModelCategory,
} from "@workspace/db";
import {
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  requireAdmin,
} from "../lib/auth";
import {
  listProviders,
  listModels,
  usageByProviderModel,
  hasEnabledProviders,
} from "../lib/ai-registry";
import { testProviderConnection } from "../lib/ai-service";
import { recordAuditEvent, reqAuditMeta } from "../lib/audit";

const router: IRouter = Router();

const adminGuards = [requireAuth, loadOrCreateClient, requireActiveClient, requireAdmin];

function fail(
  res: Parameters<Parameters<typeof router.post>[1]>[1] & {
    status: (n: number) => any;
  },
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}

router.get("/admin/ai/providers", ...adminGuards, async (_req, res) => {
  const providers = await listProviders();
  const enabled = await hasEnabledProviders();
  res.json({ data: providers, hasEnabledProviders: enabled });
});

router.patch("/admin/ai/providers/:id", ...adminGuards, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 400, "bad_request", "Invalid id");
  const allowed: Record<string, boolean> = {
    enabled: typeof req.body?.enabled === "boolean",
    notes: typeof req.body?.notes === "string",
  };
  const patch: Record<string, unknown> = {};
  if (allowed.enabled) patch.enabled = req.body.enabled;
  if (allowed.notes) patch.notes = req.body.notes.slice(0, 1000);
  if (!Object.keys(patch).length)
    return fail(res, 400, "bad_request", "No editable fields supplied");
  const [updated] = await db
    .update(aiProvidersTable)
    .set(patch)
    .where(eq(aiProvidersTable.id, id))
    .returning();
  if (!updated) return fail(res, 404, "not_found", "Provider not found");
  const meta = reqAuditMeta(req);
  await recordAuditEvent({
    actorClientId: req.dbClient!.id,
    actorEmail: req.dbClient!.email,
    category: "admin",
    action: "ai.provider.updated",
    targetType: "ai_provider",
    targetId: String(id),
    metadata: patch,
    ...meta,
  });
  res.json(updated);
});

router.get("/admin/ai/models", ...adminGuards, async (_req, res) => {
  const rows = await listModels();
  res.json({
    data: rows.map((r) => ({
      ...r.model,
      providerSlug: r.provider.slug,
      providerName: r.provider.name,
      providerEnabled: r.provider.enabled,
    })),
  });
});

router.patch("/admin/ai/models/:id", ...adminGuards, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 400, "bad_request", "Invalid id");
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
  if (typeof req.body?.defaultForCategory === "boolean")
    patch.defaultForCategory = req.body.defaultForCategory;
  if (Number.isFinite(req.body?.costMultiplierBp))
    patch.costMultiplierBp = Math.max(
      0,
      Math.min(10000, Number(req.body.costMultiplierBp)),
    );
  if (Number.isFinite(req.body?.inputCostPerKToken))
    patch.inputCostPerKToken = Math.max(0, Number(req.body.inputCostPerKToken));
  if (Number.isFinite(req.body?.outputCostPerKToken))
    patch.outputCostPerKToken = Math.max(
      0,
      Number(req.body.outputCostPerKToken),
    );
  if (typeof req.body?.supportsPhi === "boolean")
    patch.supportsPhi = req.body.supportsPhi;
  if (typeof req.body?.requiresHealthcarePlan === "boolean")
    patch.requiresHealthcarePlan = req.body.requiresHealthcarePlan;
  if (typeof req.body?.requiresSignedBaa === "boolean")
    patch.requiresSignedBaa = req.body.requiresSignedBaa;
  if (typeof req.body?.notes === "string")
    patch.notes = req.body.notes.slice(0, 1000);
  if (!Object.keys(patch).length)
    return fail(res, 400, "bad_request", "No editable fields supplied");

  // If we're flipping defaultForCategory=true, demote any other defaults in
  // the same category atomically so the registry always has at most one
  // default per category.
  if (patch.defaultForCategory === true) {
    const [model] = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.id, id))
      .limit(1);
    if (model) {
      await db
        .update(aiModelsTable)
        .set({ defaultForCategory: false })
        .where(
          and(
            eq(aiModelsTable.category, model.category),
            sql`${aiModelsTable.id} <> ${id}`,
          ),
        );
    }
  }

  const [updated] = await db
    .update(aiModelsTable)
    .set(patch)
    .where(eq(aiModelsTable.id, id))
    .returning();
  if (!updated) return fail(res, 404, "not_found", "Model not found");
  const meta = reqAuditMeta(req);
  await recordAuditEvent({
    actorClientId: req.dbClient!.id,
    actorEmail: req.dbClient!.email,
    category: "admin",
    action: "ai.model.updated",
    targetType: "ai_model",
    targetId: String(id),
    metadata: patch,
    ...meta,
  });
  res.json(updated);
});

router.post("/admin/ai/models/:id/test", ...adminGuards, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 400, "bad_request", "Invalid id");
  const [model] = await db
    .select()
    .from(aiModelsTable)
    .where(eq(aiModelsTable.id, id))
    .limit(1);
  if (!model) return fail(res, 404, "not_found", "Model not found");
  const [provider] = await db
    .select()
    .from(aiProvidersTable)
    .where(eq(aiProvidersTable.id, model.providerId))
    .limit(1);
  if (!provider) return fail(res, 404, "not_found", "Provider not found");
  const result = await testProviderConnection(provider.slug, model.modelKey);
  res.json(result);
});

router.get("/admin/ai/usage", ...adminGuards, async (_req, res) => {
  const aggregate = await usageByProviderModel();
  const recent = await db
    .select()
    .from(aiUsageTable)
    .orderBy(desc(aiUsageTable.createdAt))
    .limit(50);
  // Per-category roll-up for the dashboard summary cards.
  const byCategory: Record<AiModelCategory, { calls: number; cost: number; blocked: number }> =
    AI_MODEL_CATEGORIES.reduce(
      (acc, c) => {
        acc[c] = { calls: 0, cost: 0, blocked: 0 };
        return acc;
      },
      {} as Record<AiModelCategory, { calls: number; cost: number; blocked: number }>,
    );
  for (const r of recent) {
    const bucket = byCategory[r.category];
    if (!bucket) continue;
    bucket.calls += 1;
    bucket.cost += r.tokenCost;
    if (r.status === "blocked") bucket.blocked += 1;
  }
  res.json({ aggregate, byCategory, recent });
});

export default router;
