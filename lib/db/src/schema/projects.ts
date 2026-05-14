import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
