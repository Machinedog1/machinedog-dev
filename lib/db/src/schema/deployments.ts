import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { changeRequestsTable } from "./change-requests";
import { buildJobsTable } from "./build-jobs";

export const DEPLOYMENT_PROVIDERS = ["replit", "vercel", "render"] as const;
export type DeploymentProvider = (typeof DEPLOYMENT_PROVIDERS)[number];

export const DEPLOYMENT_STATUSES = [
  "pending",
  "building",
  "live",
  "failed",
  "canceled",
  "rolled_back",
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_ENVIRONMENTS = ["preview", "staging", "production"] as const;
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export const deploymentsTable = pgTable(
  "deployments",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    buildJobId: integer("build_job_id").references(() => buildJobsTable.id, {
      onDelete: "set null",
    }),
    changeRequestId: integer("change_request_id").references(() => changeRequestsTable.id, {
      onDelete: "set null",
    }),
    provider: text("provider", { enum: DEPLOYMENT_PROVIDERS }).notNull(),
    externalId: text("external_id"),
    environment: text("environment", { enum: DEPLOYMENT_ENVIRONMENTS })
      .notNull()
      .default("production"),
    status: text("status", { enum: DEPLOYMENT_STATUSES }).notNull().default("pending"),
    url: text("url"),
    commitSha: text("commit_sha"),
    branch: text("branch"),
    errorMessage: text("error_message"),
    tokenCost: integer("token_cost").notNull().default(0),
    metadata: jsonb("metadata"),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("deployments_project_idx").on(t.projectId, t.createdAt),
    index("deployments_org_idx").on(t.organizationId, t.createdAt),
    index("deployments_status_idx").on(t.status),
    index("deployments_external_idx").on(t.provider, t.externalId),
  ],
);

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
