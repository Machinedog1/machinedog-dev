import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { clientsTable } from "./clients";
import { aiProvidersTable } from "./ai-providers";
import { aiModelsTable } from "./ai-models";
import { AI_MODEL_CATEGORIES } from "./ai-models";

/**
 * Phase 4: per-call AI usage record. Fed by every successful AI call AND
 * every blocked call (PHI guard, healthcare gating, no-providers) so the
 * admin "usage by provider/model" charts and rate-limit dashboards have a
 * single source of truth.
 */
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizationsTable.id, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    userClientId: integer("user_client_id").references(() => clientsTable.id, {
      onDelete: "set null",
    }),
    providerId: integer("provider_id").references(() => aiProvidersTable.id, {
      onDelete: "set null",
    }),
    modelId: integer("model_id").references(() => aiModelsTable.id, {
      onDelete: "set null",
    }),
    /** Snapshot of provider slug + model key at call time so usage rows are
     *  meaningful even after a provider/model is renamed or deleted. */
    providerSlug: text("provider_slug").notNull(),
    modelKey: text("model_key").notNull(),
    category: text("category", { enum: AI_MODEL_CATEGORIES }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Token-balance deduction we charged the org for this call. 0 when the
     *  call was blocked, mocked, or otherwise free. */
    tokenCost: integer("token_cost").notNull().default(0),
    /** True when the PHI guard intercepted the call before reaching the
     *  provider. The metadata never contains the offending content. */
    blockedForPhi: boolean("blocked_for_phi").notNull().default(false),
    /** True when Healthcare-Safe gating refused the call. */
    blockedForHealthcareGating: boolean("blocked_for_healthcare_gating")
      .notNull()
      .default(false),
    /** True when no providers were configured and we returned a mock. */
    mocked: boolean("mocked").notNull().default(false),
    status: text("status", {
      enum: ["ok", "error", "blocked"],
    })
      .notNull()
      .default("ok"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("ai_usage_org_idx").on(t.organizationId, t.createdAt),
    projectIdx: index("ai_usage_project_idx").on(t.projectId, t.createdAt),
    providerIdx: index("ai_usage_provider_idx").on(t.providerId, t.createdAt),
    modelIdx: index("ai_usage_model_idx").on(t.modelId, t.createdAt),
  }),
);

export const insertAiUsageSchema = createInsertSchema(aiUsageTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;
export type AiUsage = typeof aiUsageTable.$inferSelect;
