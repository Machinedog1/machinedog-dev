import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  email: text("email").notNull(),
  tokenBalance: integer("token_balance").notNull().default(0),
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  status: text("status", { enum: ["active", "suspended", "invited"] }).notNull().default("invited"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
