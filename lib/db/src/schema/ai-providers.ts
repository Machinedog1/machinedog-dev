import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AI_PROVIDER_SLUGS = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "aws_bedrock",
  "local",
] as const;
export type AiProviderSlug = (typeof AI_PROVIDER_SLUGS)[number];

/**
 * Phase 4: AI provider registry. Operator-managed; admins toggle providers
 * on/off and the AI service resolves a model from this table at call time
 * rather than referencing any hardcoded model name in code.
 */
export const aiProvidersTable = pgTable(
  "ai_providers",
  {
    id: serial("id").primaryKey(),
    slug: text("slug", { enum: AI_PROVIDER_SLUGS }).notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    supportsStreaming: boolean("supports_streaming").notNull().default(true),
    supportsTools: boolean("supports_tools").notNull().default(false),
    supportsVision: boolean("supports_vision").notNull().default(false),
    supportsLongContext: boolean("supports_long_context")
      .notNull()
      .default(false),
    supportsHealthcare: boolean("supports_healthcare").notNull().default(false),
    requiresBaaForPhi: boolean("requires_baa_for_phi")
      .notNull()
      .default(true),
    /** Free-form notes the operator can add (BAA contract reference, etc.) */
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
    slugUnique: uniqueIndex("ai_providers_slug_unique").on(t.slug),
    enabledIdx: index("ai_providers_enabled_idx").on(t.enabled),
  }),
);

export const insertAiProviderSchema = createInsertSchema(aiProvidersTable).omit(
  { id: true, createdAt: true, updatedAt: true },
);
export type InsertAiProvider = z.infer<typeof insertAiProviderSchema>;
export type AiProvider = typeof aiProvidersTable.$inferSelect;
