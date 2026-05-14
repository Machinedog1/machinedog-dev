import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";

export const projectSecretsTable = pgTable(
  "project_secrets",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    projectId: integer("project_id").notNull().references(() => projectsTable.id),
    name: text("name").notNull(),
    environment: text("environment", {
      enum: ["development", "staging", "production"],
    }).notNull().default("development"),
    encryptedValue: text("encrypted_value").notNull(),
    nonce: text("nonce").notNull(),
    authTag: text("auth_tag").notNull(),
    valuePreview: text("value_preview").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdByEmail: text("created_by_email"),
    updatedByEmail: text("updated_by_email"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    projectEnvNameUnique: uniqueIndex("project_secrets_project_env_name_unique").on(
      t.projectId,
      t.environment,
      t.name,
    ),
    projectIdx: index("project_secrets_project_idx").on(t.projectId),
  }),
);

export const insertProjectSecretSchema = createInsertSchema(projectSecretsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProjectSecret = z.infer<typeof insertProjectSecretSchema>;
export type ProjectSecret = typeof projectSecretsTable.$inferSelect;
