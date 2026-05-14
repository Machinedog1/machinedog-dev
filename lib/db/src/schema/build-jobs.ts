import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { changeRequestsTable } from "./change-requests";

export const BUILD_JOB_PROVIDERS = ["replit", "vercel", "render"] as const;
export type BuildJobProvider = (typeof BUILD_JOB_PROVIDERS)[number];

export const BUILD_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type BuildJobStatus = (typeof BUILD_JOB_STATUSES)[number];

export const BUILD_JOB_ENVIRONMENTS = ["development", "preview", "staging", "production"] as const;
export type BuildJobEnvironment = (typeof BUILD_JOB_ENVIRONMENTS)[number];

export const buildJobsTable = pgTable(
  "build_jobs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    changeRequestId: integer("change_request_id").references(() => changeRequestsTable.id, {
      onDelete: "set null",
    }),
    provider: text("provider", { enum: BUILD_JOB_PROVIDERS }).notNull(),
    externalId: text("external_id"),
    status: text("status", { enum: BUILD_JOB_STATUSES }).notNull().default("queued"),
    environment: text("environment", { enum: BUILD_JOB_ENVIRONMENTS })
      .notNull()
      .default("production"),
    commitSha: text("commit_sha"),
    branch: text("branch"),
    logsUrl: text("logs_url"),
    errorMessage: text("error_message"),
    tokenCost: integer("token_cost").notNull().default(0),
    triggeredBy: text("triggered_by"),
    triggeredByEmail: text("triggered_by_email"),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("build_jobs_project_idx").on(t.projectId, t.createdAt),
    index("build_jobs_org_idx").on(t.organizationId, t.createdAt),
    index("build_jobs_status_idx").on(t.status),
    index("build_jobs_external_idx").on(t.provider, t.externalId),
  ],
);

export const insertBuildJobSchema = createInsertSchema(buildJobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBuildJob = z.infer<typeof insertBuildJobSchema>;
export type BuildJob = typeof buildJobsTable.$inferSelect;
