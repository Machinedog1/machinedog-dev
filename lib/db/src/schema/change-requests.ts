import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { clientsTable } from "./clients";
import { organizationsTable } from "./organizations";

export const CHANGE_REQUEST_STATUSES = [
  "draft",
  "distilling",
  "distilled",
  "generating_patch",
  "patched",
  "snapshot_taken",
  "pr_open",
  "awaiting_publish",
  "merged",
  "awaiting_deploy",
  "deployed",
  "rolled_back",
  "failed",
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const changeRequestsTable = pgTable(
  "change_requests",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    requesterClientId: integer("requester_client_id").notNull().references(() => clientsTable.id),
    // Phase 0 foundation: nullable organization scope (mirrors project.organizationId).
    // New code should filter on this; legacy code uses requesterClientId via the project.
    organizationId: integer("organization_id").references(() => organizationsTable.id),
    status: text("status", { enum: CHANGE_REQUEST_STATUSES }).notNull().default("draft"),
    title: text("title").notNull().default(""),
    rawRequest: text("raw_request").notNull(),
    distilledSpec: jsonb("distilled_spec"),
    patchSummary: text("patch_summary"),
    patchFiles: jsonb("patch_files"),
    githubBranch: text("github_branch"),
    githubPrNumber: integer("github_pr_number"),
    githubPrUrl: text("github_pr_url"),
    snapshotTag: text("snapshot_tag"),
    snapshotSha: text("snapshot_sha"),
    previewUrl: text("preview_url"),
    errorMessage: text("error_message"),
    requestedPublishAt: timestamp("requested_publish_at", { withTimezone: true }),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("change_requests_project_idx").on(t.projectId, t.createdAt)],
);

export const insertChangeRequestSchema = createInsertSchema(changeRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertChangeRequest = z.infer<typeof insertChangeRequestSchema>;
export type ChangeRequest = typeof changeRequestsTable.$inferSelect;

export const CHANGE_REQUEST_EVENT_KINDS = [
  "created",
  "distill_started",
  "distill_succeeded",
  "distill_failed",
  "patch_started",
  "patch_succeeded",
  "patch_failed",
  "snapshot_created",
  "branch_pushed",
  "pr_opened",
  "publish_requested",
  "pr_merged",
  "deploy_marked",
  "deploy_auto_detected",
  "rollback_requested",
  "rollback_pr_opened",
  "rolled_back",
  "comment",
  "error",
] as const;
export type ChangeRequestEventKind = (typeof CHANGE_REQUEST_EVENT_KINDS)[number];

export const changeRequestEventsTable = pgTable(
  "change_request_events",
  {
    id: serial("id").primaryKey(),
    changeRequestId: integer("change_request_id")
      .notNull()
      .references(() => changeRequestsTable.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: CHANGE_REQUEST_EVENT_KINDS }).notNull(),
    message: text("message").notNull().default(""),
    actorClientId: integer("actor_client_id").references(() => clientsTable.id),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("change_request_events_cr_idx").on(t.changeRequestId, t.createdAt)],
);

export const insertChangeRequestEventSchema = createInsertSchema(changeRequestEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertChangeRequestEvent = z.infer<typeof insertChangeRequestEventSchema>;
export type ChangeRequestEvent = typeof changeRequestEventsTable.$inferSelect;
