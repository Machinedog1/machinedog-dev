/**
 * Phase 4 — seed the provider + model registry. Idempotent: re-running it
 * leaves existing rows alone (so operator-tweaked enabled flags / multipliers
 * survive). Only inserts new rows that don't yet exist.
 *
 * Healthcare-Safe entries are seeded as `enabled=false` until the operator
 * confirms the provider's BAA is in effect; the admin UI surfaces this.
 */
import { eq, and } from "drizzle-orm";
import {
  db,
  aiProvidersTable,
  aiModelsTable,
  type AiProviderSlug,
  type AiModelCategory,
} from "@workspace/db";
import { logger } from "./logger";

interface ProviderSeed {
  slug: AiProviderSlug;
  name: string;
  enabled: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsLongContext: boolean;
  supportsHealthcare: boolean;
  requiresBaaForPhi: boolean;
  notes?: string;
}

interface ModelSeed {
  providerSlug: AiProviderSlug;
  modelKey: string;
  name: string;
  category: AiModelCategory;
  enabled: boolean;
  defaultForCategory: boolean;
  inputCostPerKToken: number;
  outputCostPerKToken: number;
  contextWindow: number;
  supportsLongContext?: boolean;
  supportsPhi?: boolean;
  requiresHealthcarePlan?: boolean;
  requiresSignedBaa?: boolean;
  notes?: string;
}

const PROVIDERS: ProviderSeed[] = [
  {
    slug: "anthropic",
    name: "Anthropic (Claude)",
    enabled: true,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsLongContext: true,
    supportsHealthcare: true,
    requiresBaaForPhi: true,
    notes: "Wired via Replit AI integrations proxy.",
  },
  {
    slug: "openai",
    name: "OpenAI",
    enabled: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsLongContext: true,
    supportsHealthcare: true,
    requiresBaaForPhi: true,
    notes: "Adapter not yet implemented — enable once wired.",
  },
  {
    slug: "google",
    name: "Google (Gemini)",
    enabled: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsLongContext: true,
    supportsHealthcare: false,
    requiresBaaForPhi: true,
    notes: "Adapter not yet implemented.",
  },
  {
    slug: "mistral",
    name: "Mistral",
    enabled: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsLongContext: false,
    supportsHealthcare: false,
    requiresBaaForPhi: true,
  },
  {
    slug: "aws_bedrock",
    name: "AWS Bedrock",
    enabled: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsLongContext: true,
    supportsHealthcare: true,
    requiresBaaForPhi: true,
    notes: "BAA available with AWS account; adapter not yet implemented.",
  },
  {
    slug: "local",
    name: "Local / self-hosted",
    enabled: false,
    supportsStreaming: false,
    supportsTools: false,
    supportsVision: false,
    supportsLongContext: false,
    supportsHealthcare: true,
    requiresBaaForPhi: false,
    notes: "Air-gapped local model slot.",
  },
];

const MODELS: ModelSeed[] = [
  // Fast lane
  {
    providerSlug: "anthropic",
    modelKey: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    category: "fast",
    enabled: true,
    defaultForCategory: true,
    inputCostPerKToken: 2,
    outputCostPerKToken: 6,
    contextWindow: 200_000,
  },
  {
    providerSlug: "openai",
    modelKey: "gpt-4o-mini",
    name: "GPT-4o mini",
    category: "fast",
    enabled: false,
    defaultForCategory: false,
    inputCostPerKToken: 2,
    outputCostPerKToken: 6,
    contextWindow: 128_000,
  },
  // Coding lane
  {
    providerSlug: "anthropic",
    modelKey: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    category: "coding",
    enabled: true,
    defaultForCategory: true,
    inputCostPerKToken: 6,
    outputCostPerKToken: 18,
    contextWindow: 200_000,
  },
  {
    providerSlug: "openai",
    modelKey: "gpt-4.1",
    name: "GPT-4.1 (coding)",
    category: "coding",
    enabled: false,
    defaultForCategory: false,
    inputCostPerKToken: 8,
    outputCostPerKToken: 24,
    contextWindow: 128_000,
  },
  // Architect lane
  {
    providerSlug: "anthropic",
    modelKey: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    category: "architect",
    enabled: true,
    defaultForCategory: true,
    inputCostPerKToken: 25,
    outputCostPerKToken: 75,
    contextWindow: 200_000,
  },
  {
    providerSlug: "openai",
    modelKey: "o3",
    name: "OpenAI o3 (reasoning)",
    category: "architect",
    enabled: false,
    defaultForCategory: false,
    inputCostPerKToken: 30,
    outputCostPerKToken: 90,
    contextWindow: 200_000,
  },
  // Long context lane
  {
    providerSlug: "anthropic",
    modelKey: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (long context)",
    category: "long_context",
    enabled: true,
    defaultForCategory: true,
    inputCostPerKToken: 6,
    outputCostPerKToken: 18,
    contextWindow: 200_000,
    supportsLongContext: true,
  },
  {
    providerSlug: "google",
    modelKey: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro (1M context)",
    category: "long_context",
    enabled: false,
    defaultForCategory: false,
    inputCostPerKToken: 5,
    outputCostPerKToken: 15,
    contextWindow: 1_000_000,
    supportsLongContext: true,
  },
  // Healthcare-safe lane — disabled until BAA confirmed by operator
  {
    providerSlug: "aws_bedrock",
    modelKey: "anthropic.claude-3-5-sonnet-v2",
    name: "Bedrock Claude 3.5 Sonnet (BAA)",
    category: "healthcare_safe",
    enabled: false,
    defaultForCategory: true,
    inputCostPerKToken: 8,
    outputCostPerKToken: 24,
    contextWindow: 200_000,
    supportsPhi: true,
    requiresHealthcarePlan: true,
    requiresSignedBaa: true,
    notes: "Requires AWS Bedrock with signed BAA; enable after operator BAA is in effect.",
  },
  {
    providerSlug: "openai",
    modelKey: "gpt-4o-baa",
    name: "OpenAI GPT-4o (BAA tier)",
    category: "healthcare_safe",
    enabled: false,
    defaultForCategory: false,
    inputCostPerKToken: 10,
    outputCostPerKToken: 30,
    contextWindow: 128_000,
    supportsPhi: true,
    requiresHealthcarePlan: true,
    requiresSignedBaa: true,
  },
  {
    providerSlug: "anthropic",
    modelKey: "claude-sonnet-4-6-baa",
    name: "Anthropic Sonnet 4.6 (BAA tier)",
    category: "healthcare_safe",
    enabled: false,
    defaultForCategory: false,
    inputCostPerKToken: 8,
    outputCostPerKToken: 24,
    contextWindow: 200_000,
    supportsPhi: true,
    requiresHealthcarePlan: true,
    requiresSignedBaa: true,
  },
];

export async function seedAiRegistry(): Promise<void> {
  // Providers — insert if missing.
  const existingProviders = await db.select().from(aiProvidersTable);
  const providerBySlug = new Map(existingProviders.map((p) => [p.slug, p]));
  for (const p of PROVIDERS) {
    if (providerBySlug.has(p.slug)) continue;
    const [inserted] = await db
      .insert(aiProvidersTable)
      .values({
        slug: p.slug,
        name: p.name,
        enabled: p.enabled,
        supportsStreaming: p.supportsStreaming,
        supportsTools: p.supportsTools,
        supportsVision: p.supportsVision,
        supportsLongContext: p.supportsLongContext,
        supportsHealthcare: p.supportsHealthcare,
        requiresBaaForPhi: p.requiresBaaForPhi,
        notes: p.notes ?? null,
      })
      .returning();
    providerBySlug.set(inserted.slug, inserted);
    logger.info({ slug: p.slug }, "seed-ai-registry: inserted provider");
  }

  // Models — insert if (provider, modelKey) pair is missing.
  for (const m of MODELS) {
    const provider = providerBySlug.get(m.providerSlug);
    if (!provider) continue;
    const [existing] = await db
      .select()
      .from(aiModelsTable)
      .where(
        and(
          eq(aiModelsTable.providerId, provider.id),
          eq(aiModelsTable.modelKey, m.modelKey),
          eq(aiModelsTable.category, m.category),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(aiModelsTable).values({
      providerId: provider.id,
      modelKey: m.modelKey,
      name: m.name,
      category: m.category,
      enabled: m.enabled,
      defaultForCategory: m.defaultForCategory,
      inputCostPerKToken: m.inputCostPerKToken,
      outputCostPerKToken: m.outputCostPerKToken,
      contextWindow: m.contextWindow,
      supportsLongContext: m.supportsLongContext ?? false,
      supportsPhi: m.supportsPhi ?? false,
      requiresHealthcarePlan: m.requiresHealthcarePlan ?? false,
      requiresSignedBaa: m.requiresSignedBaa ?? false,
      notes: m.notes ?? null,
    });
    logger.info(
      { providerSlug: m.providerSlug, modelKey: m.modelKey, category: m.category },
      "seed-ai-registry: inserted model",
    );
  }
}
