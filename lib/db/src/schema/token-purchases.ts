import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { organizationsTable } from "./organizations";

export const tokenPurchasesTable = pgTable("token_purchases", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  // Phase 0 foundation: nullable organization scope (mirrors clientId).
  organizationId: integer("organization_id").references(() => organizationsTable.id),
  stripeSessionId: text("stripe_session_id"),
  bundleKey: text("bundle_key").notNull(),
  tokensAdded: integer("tokens_added").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["pending", "completed", "failed"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTokenPurchaseSchema = createInsertSchema(tokenPurchasesTable).omit({ id: true, createdAt: true });
export type InsertTokenPurchase = z.infer<typeof insertTokenPurchaseSchema>;
export type TokenPurchase = typeof tokenPurchasesTable.$inferSelect;
