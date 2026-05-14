import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";

export const projectCommentsTable = pgTable("project_comments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectCommentSchema = createInsertSchema(projectCommentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProjectComment = z.infer<typeof insertProjectCommentSchema>;
export type ProjectComment = typeof projectCommentsTable.$inferSelect;
