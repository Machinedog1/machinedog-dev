import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiProvidersTable } from "./ai-providers";

export const AI_MODEL_CATEGORIES = [
  "auto",
  "fast",
  "coding",
  "architect",
  "long_context",
  "healthcare_safe",
] as const;
export type AiModelCategory = (typeof AI_MODEL_CATEGORIES)[number];

/**
 * Phase 4: provider-scoped model registry. The AI service resolves a model
 * from this table at call time based on the requested category. There is
 * exactly one `defaultForCategory=true` row per category among enabled rows;
 * the admin UI enforces this when toggling defaults.
 */
export const aiModelsTable = pgTable(
  "ai_models",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => aiProvidersTable.id, { onDelete: "cascade" }),
    /** Provider-side model id, e.g. "claude-sonnet-4-6", "gpt-4o-mini". */
    modelKey: text("model_key").notNull(),
    /** Friendly display name for the admin UI. */
    name: text("name").notNull(),
    category: text("category", { enum: AI_MODEL_CATEGORIES }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    defaultForCategory: boolean("default_for_category")
      .notNull()
      .default(false),
    /** Per-token cost in tokens-of-our-currency. Multiplied by inputTokens
     *  and outputTokens (we treat them equally for v1) and the multiplier
     *  to compute the deduction. */
    inputCostPerKToken: integer("input_cost_per_k_token")
      .notNull()
      .default(10),
    outputCostPerKToken: integer("output_cost_per_k_token")
      .notNull()
      .default(30),
    /** Operator-tunable multiplier (basis-points style: 100 = 1.0x). Lets
     *  us mark up healthcare/architect models without re-deploying code. */
    costMultiplierBp: integer("cost_multiplier_bp").notNull().default(100),
    /** Maximum context window the model accepts, in tokens. */
    contextWindow: integer("context_window").notNull().default(8000),
    /** Capability flags individually settable per model. */
    supportsStreaming: boolean("supports_streaming").notNull().default(true),
    supportsVision: boolean("supports_vision").notNull().default(false),
    supportsLongContext: boolean("supports_long_context")
      .notNull()
      .default(false),
    supportsPhi: boolean("supports_phi").notNull().default(false),
    requiresHealthcarePlan: boolean("requires_healthcare_plan")
      .notNull()
      .default(false),
    requiresSignedBaa: boolean("requires_signed_baa")
      .notNull()
      .default(false),
    /** Free-form notes (BAA reference, sunset date, etc.). */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    providerModelUnique: uniqueIndex("ai_models_provider_model_unique").on(
      t.providerId,
      t.modelKey,
      t.category,
    ),
    categoryIdx: index("ai_models_category_idx").on(t.category, t.enabled),
  }),
);

export const insertAiModelSchema = createInsertSchema(aiModelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiModel = z.infer<typeof insertAiModelSchema>;
export type AiModel = typeof aiModelsTable.$inferSelect;
