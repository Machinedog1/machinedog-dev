import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    notes: text("notes"),
    source: text("source").notNull().default("pricing-page"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    notifyError: text("notify_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("leads_created_at_idx").on(table.createdAt),
    emailIdx: index("leads_email_idx").on(table.email),
  }),
);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  notifiedAt: true,
  notifyError: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
