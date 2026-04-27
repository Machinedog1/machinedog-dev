import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const TIMELINE_OPTIONS = [
  "asap",
  "1-3-months",
  "3-6-months",
  "exploring",
] as const;

export const BUDGET_OPTIONS = [
  "under-5k",
  "5k-15k",
  "15k-50k",
  "50k-plus",
  "not-sure",
] as const;

export const INTAKE_STATUS = ["new", "contacted", "qualified", "closed"] as const;

export const intakeSubmissionsTable = pgTable("intake_submissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  projectDescription: text("project_description").notNull(),
  timeline: text("timeline", { enum: TIMELINE_OPTIONS }).notNull(),
  budget: text("budget", { enum: BUDGET_OPTIONS }).notNull(),
  referralSource: text("referral_source"),
  successCriteria: text("success_criteria").notNull(),
  status: text("status", { enum: INTAKE_STATUS }).notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertIntakeSubmissionSchema = createInsertSchema(
  intakeSubmissionsTable,
).omit({ id: true, createdAt: true, updatedAt: true, status: true });
export type InsertIntakeSubmission = z.infer<typeof insertIntakeSubmissionSchema>;
export type IntakeSubmission = typeof intakeSubmissionsTable.$inferSelect;
