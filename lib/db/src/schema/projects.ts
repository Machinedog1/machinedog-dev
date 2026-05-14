import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { organizationsTable } from "./organizations";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  // Phase 0 foundation: nullable mirror of clientId pointing at the new
  // organizations table. Backfilled 1:1 from clientId. New code MUST prefer
  // this column; legacy code keeps using clientId until Phase 0 follow-ups.
  organizationId: integer("organization_id").references(() => organizationsTable.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  summary: text("summary").notNull().default(""),
  liveUrl: text("live_url"),
  coverImageUrl: text("cover_image_url"),
  status: text("status", { enum: ["draft", "active", "completed", "archived"] }).notNull().default("draft"),
  // Phase 2: Template / project-type metadata. Drives Template Center filters,
  // per-template AI system prompts (Phase 4), and healthcare gating (Phase 8).
  projectType: text("project_type", {
    enum: ["web_app", "mobile_app", "api", "internal_tool", "healthcare_template", "other"],
  }).notNull().default("web_app"),
  framework: text("framework").notNull().default("react"),
  // Slug of the template the project was created from (null for blank /
  // GitHub-imported projects). Lets us re-render the original template badge
  // and gate per-template AI system prompts in later phases.
  templateSlug: text("template_slug"),
  // Healthcare tier flags. healthcareMode unlocks the compliance UI (Phase 8);
  // phiAllowed only flips on after the org's BAA is signed.
  healthcareMode: boolean("healthcare_mode").notNull().default(false),
  phiAllowed: boolean("phi_allowed").notNull().default(false),
  baaStatus: text("baa_status", {
    enum: ["not_required", "required", "pending", "active", "expired"],
  }).notNull().default("not_required"),
  // Workspace runtime metadata. v1 uses a database-backed file tree
  // (Phase 3) rather than a real per-project sandbox, but we record what
  // provider would back this workspace if we promoted it later.
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
  // GitHub repo Machinedog opens change-request PRs against. When unset, the
  // change-request flow runs in "draft only" mode (no PR / no preview).
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  githubDefaultBranch: text("github_default_branch").notNull().default("main"),
  // Template URL for per-branch preview deploys. Use `{branch}` placeholder.
  // Example: "https://preview-{branch}.beesuite.farm".
  previewUrlTemplate: text("preview_url_template"),
  // Production URL the operator (Tom) re-publishes on Replit when a change
  // request is approved.
  productionUrl: text("production_url"),
  // Operator email notified when a client clicks Publish. Falls back to the
  // ADMIN_EMAILS list when unset.
  operatorEmail: text("operator_email"),
  // Per-project secret used by the heartbeat snippet installed in the client
  // app to auto-report its current Replit dev URL. Auto-generated on insert;
  // operator can rotate from the admin UI. The snippet POSTs to
  // /api/projects/heartbeat with this token + the live REPLIT_DEV_DOMAIN.
  heartbeatToken: text("heartbeat_token").unique(),
  // When the snippet last reported in. Lets the UI show a freshness indicator
  // ("Dev URL refreshed 30s ago") and detect stale links.
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  // Production-side heartbeat: the same snippet, when running on the deployed
  // app (where REPLIT_DEV_DOMAIN is unset), POSTs to /projects/prod-heartbeat
  // on every boot. We use this to auto-flip change requests from
  // `awaiting_deploy` to `deployed` when a fresh production boot is observed
  // after the merge commit landed.
  productionHeartbeatAt: timestamp("production_heartbeat_at", { withTimezone: true }),
  productionBootedAt: timestamp("production_booted_at", { withTimezone: true }),
  // Deduplication marker — same boot reports it many times under Autoscale
  // (every request can spawn the same instance reporting in). Format is
  // `{bootedAt-epoch-ms}|{releaseMarker}` so a true new boot or a new release
  // changes the value.
  productionBootMarker: text("production_boot_marker"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // GitHub owner/repo are case-insensitive — enforce uniqueness on the
  // normalized lowercase pair so concurrent imports of the same repo can't
  // both succeed past the dedupe check in the import handler.
  githubOwnerRepoUnique: uniqueIndex("projects_github_owner_repo_unique").on(
    sql`lower(${table.githubOwner})`,
    sql`lower(${table.githubRepo})`,
  ),
}));

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
