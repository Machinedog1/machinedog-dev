import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
