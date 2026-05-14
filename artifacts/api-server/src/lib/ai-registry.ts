/**
 * Phase 4 — AI provider/model registry helpers. Centralizes the lookup logic
 * so route handlers never touch raw drizzle queries against the registry
 * tables directly.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  aiProvidersTable,
  aiModelsTable,
  aiUsageTable,
  type AiProvider,
  type AiModel,
  type AiModelCategory,
  AI_PROVIDER_SLUGS,
  AI_MODEL_CATEGORIES,
  type AiProviderSlug,
} from "@workspace/db";

export interface ResolvedModel {
  provider: AiProvider;
  model: AiModel;
}

/** Find the enabled default model for a category, or any enabled model if no
 *  default is set. Returns null when no enabled model exists for the category. */
export async function resolveCategoryModel(
  category: AiModelCategory,
): Promise<ResolvedModel | null> {
  const rows = await db
    .select({ model: aiModelsTable, provider: aiProvidersTable })
    .from(aiModelsTable)
    .innerJoin(
      aiProvidersTable,
      eq(aiModelsTable.providerId, aiProvidersTable.id),
    )
    .where(
      and(
        eq(aiModelsTable.category, category),
        eq(aiModelsTable.enabled, true),
        eq(aiProvidersTable.enabled, true),
      ),
    )
    .orderBy(desc(aiModelsTable.defaultForCategory), aiModelsTable.id);
  const first = rows[0];
  return first ? { provider: first.provider, model: first.model } : null;
}

export async function listProviders(): Promise<AiProvider[]> {
  return await db
    .select()
    .from(aiProvidersTable)
    .orderBy(aiProvidersTable.id);
}

export async function listModels(): Promise<
  Array<{ model: AiModel; provider: AiProvider }>
> {
  const rows = await db
    .select({ model: aiModelsTable, provider: aiProvidersTable })
    .from(aiModelsTable)
    .innerJoin(
      aiProvidersTable,
      eq(aiModelsTable.providerId, aiProvidersTable.id),
    )
    .orderBy(aiModelsTable.category, aiModelsTable.id);
  return rows;
}

/** True when there is at least one enabled provider with at least one
 *  enabled model. Drives the "no providers configured" mock-mode banner. */
export async function hasEnabledProviders(): Promise<boolean> {
  const [{ count }] = (await db.execute(
    sql`SELECT COUNT(*)::int AS count
        FROM ai_models m
        JOIN ai_providers p ON p.id = m.provider_id
        WHERE m.enabled = true AND p.enabled = true`,
  )).rows as Array<{ count: number }>;
  return Number(count) > 0;
}

/** Returns aggregate usage rows for the admin chart. */
export async function usageByProviderModel(): Promise<
  Array<{
    providerSlug: string;
    modelKey: string;
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    blocked: number;
  }>
> {
  const rows = await db
    .select({
      providerSlug: aiUsageTable.providerSlug,
      modelKey: aiUsageTable.modelKey,
      totalCalls: sql<number>`COUNT(*)::int`,
      totalInputTokens: sql<number>`COALESCE(SUM(${aiUsageTable.inputTokens}),0)::int`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${aiUsageTable.outputTokens}),0)::int`,
      totalCost: sql<number>`COALESCE(SUM(${aiUsageTable.tokenCost}),0)::int`,
      blocked: sql<number>`SUM(CASE WHEN ${aiUsageTable.status} = 'blocked' THEN 1 ELSE 0 END)::int`,
    })
    .from(aiUsageTable)
    .groupBy(aiUsageTable.providerSlug, aiUsageTable.modelKey)
    .orderBy(desc(sql`COUNT(*)`));
  return rows;
}

export function isProviderSlug(s: string): s is AiProviderSlug {
  return (AI_PROVIDER_SLUGS as readonly string[]).includes(s);
}

export function isCategory(s: string): s is AiModelCategory {
  return (AI_MODEL_CATEGORIES as readonly string[]).includes(s);
}

/** Compute token cost for an AI call given the resolved model and usage. */
export function computeTokenCost(
  model: AiModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputK = inputTokens / 1000;
  const outputK = outputTokens / 1000;
  const raw = inputK * model.inputCostPerKToken + outputK * model.outputCostPerKToken;
  const adjusted = (raw * model.costMultiplierBp) / 100;
  return Math.max(1, Math.ceil(adjusted));
}
