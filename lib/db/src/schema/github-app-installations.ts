import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const githubAppInstallationsTable = pgTable(
  "github_app_installations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    installationId: integer("installation_id").notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type", { enum: ["User", "Organization"] })
      .notNull()
      .default("User"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uniqInstallation: uniqueIndex("github_app_installations_installation_id_key").on(
      t.installationId,
    ),
    byOrg: index("github_app_installations_organization_id_idx").on(t.organizationId),
  }),
);

export const insertGithubAppInstallationSchema = createInsertSchema(
  githubAppInstallationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type GithubAppInstallation = typeof githubAppInstallationsTable.$inferSelect;
export type NewGithubAppInstallation = z.infer<typeof insertGithubAppInstallationSchema>;
