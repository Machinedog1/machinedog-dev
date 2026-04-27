import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { clientsTable } from "./clients";

export const projectMembersTable = pgTable(
  "project_members",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
    role: text("role", { enum: ["owner", "collaborator"] })
      .notNull()
      .default("collaborator"),
    status: text("status", { enum: ["pending", "active", "removed"] })
      .notNull()
      .default("pending"),
    invitedByClientId: integer("invited_by_client_id").references(() => clientsTable.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => ({
    projectEmailUnique: uniqueIndex("project_members_project_email_uniq").on(
      table.projectId,
      table.email,
    ),
  }),
);

export const insertProjectMemberSchema = createInsertSchema(projectMembersTable).omit({
  id: true,
  invitedAt: true,
  acceptedAt: true,
});
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembersTable.$inferSelect;
