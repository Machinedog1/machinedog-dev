import { pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const TEMPLATE_PROJECT_TYPES = [
  "web_app",
  "mobile_app",
  "api",
  "internal_tool",
  "healthcare_template",
  "other",
] as const;
export type TemplateProjectType = (typeof TEMPLATE_PROJECT_TYPES)[number];

export const TEMPLATE_CATEGORIES = [
  "general",
  "healthcare",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplateStarterFile = {
  path: string;
  contents: string;
};

export const templatesTable = pgTable(
  "templates",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category", { enum: TEMPLATE_CATEGORIES }).notNull().default("general"),
    framework: text("framework").notNull().default("react"),
    projectType: text("project_type", { enum: TEMPLATE_PROJECT_TYPES }).notNull().default("web_app"),
    isHealthcare: boolean("is_healthcare").notNull().default(false),
    tokenCost: integer("token_cost").notNull().default(0),
    starterFiles: jsonb("starter_files").$type<TemplateStarterFile[]>().notNull().default([]),
    complianceNotes: text("compliance_notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("templates_slug_unique").on(t.slug),
  }),
);

export const insertTemplateSchema = createInsertSchema(templatesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templatesTable.$inferSelect;
