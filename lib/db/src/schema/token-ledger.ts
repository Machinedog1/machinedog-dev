import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { clientsTable } from "./clients";
import { projectsTable } from "./projects";

/**
 * Phase 1: append-only token ledger. Every grant, purchase, deduction, or
 * admin adjustment writes a row with `balanceAfter` so the org's balance is
 * always reconstructable. Idempotent on `stripeEventId` for Stripe-driven
 * events (unique constraint).
 */
export const tokenLedgerTable = pgTable(
  "token_ledger",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    // Optional actor (the user who triggered the deduction, if any).
    userId: integer("user_id").references(() => clientsTable.id),
    projectId: integer("project_id").references(() => projectsTable.id),
    type: text("type", {
      enum: [
        "grant_monthly",
        "grant_signup",
        "purchase_pack",
        "deduct_ai",
        "deduct_build",
        "deduct_deploy",
        "deduct_template",
        "deduct_other",
        "admin_adjust",
        "refund",
      ],
    }).notNull(),
    // Positive for credits, negative for deductions.
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    description: text("description"),
    metadata: jsonb("metadata"),
    stripeEventId: text("stripe_event_id").unique(),
    source: text("source", { enum: ["stripe", "dev_mock", "system", "admin"] })
      .notNull()
      .default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("token_ledger_org_idx").on(t.organizationId),
    typeIdx: index("token_ledger_type_idx").on(t.type),
    createdAtIdx: index("token_ledger_created_at_idx").on(t.createdAt),
  }),
);

export const insertTokenLedgerSchema = createInsertSchema(tokenLedgerTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTokenLedger = z.infer<typeof insertTokenLedgerSchema>;
export type TokenLedger = typeof tokenLedgerTable.$inferSelect;
