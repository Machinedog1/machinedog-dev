import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  summary: text("summary").notNull().default(""),
  liveUrl: text("live_url"),
  coverImageUrl: text("cover_image_url"),
  status: text("status", { enum: ["draft", "active", "completed", "archived"] }).notNull().default("draft"),
  projectType: text("project_type", {
    enum: ["web_app", "mobile_app", "api", "internal_tool", "healthcare_template", "other"],
  }).notNull().default("web_app"),
  framework: text("framework").notNull().default("react"),
  templateSlug: text("template_slug"),
  healthcareMode: boolean("healthcare_mode").notNull().default(false),
  phiAllowed: boolean("phi_allowed").notNull().default(false),
  baaStatus: text("baa_status", {
    enum: ["not_required", "required", "pending", "active", "expired"],
  }).notNull().default("not_required"),
  workspaceProvider: text("workspace_provider", {
    enum: ["database", "replit", "external"],
  }).notNull().default("database"),
  workspaceStatus: text("workspace_status", {
    enum: ["idle", "starting", "running", "stopping", "error"],
  }).notNull().default("idle"),
  workspaceUrl: text("workspace_url"),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastStoppedAt: timestamp("last_stopped_at", { withTimezone: true }),
  consultingBookingId: integer("consulting_booking_id"),
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  githubDefaultBranch: text("github_default_branch").notNull().default("main"),
  previewUrlTemplate: text("preview_url_template"),
  productionUrl: text("production_url"),
  operatorEmail: text("operator_email"),
  heartbeatToken: text("heartbeat_token").unique(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  productionHeartbeatAt: timestamp("production_heartbeat_at", { withTimezone: true }),
  productionBootedAt: timestamp("production_booted_at", { withTimezone: true }),
  productionBootMarker: text("production_boot_marker"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  githubOwnerRepoUnique: uniqueIndex("projects_github_owner_repo_unique").on(
    sql`lower(${table.githubOwner})`,
    sql`lower(${table.githubRepo})`,
  ),
}));

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
