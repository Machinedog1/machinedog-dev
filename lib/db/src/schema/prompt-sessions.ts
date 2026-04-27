import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { projectsTable } from "./projects";

export const promptSessionsTable = pgTable("prompt_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(),
  output: text("output").notNull().default(""),
  tokensUsed: integer("tokens_used").notNull().default(0),
  model: text("model").notNull().default("claude-sonnet-4-6"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPromptSessionSchema = createInsertSchema(promptSessionsTable).omit({ id: true, createdAt: true });
export type InsertPromptSession = z.infer<typeof insertPromptSessionSchema>;
export type PromptSession = typeof promptSessionsTable.$inferSelect;
