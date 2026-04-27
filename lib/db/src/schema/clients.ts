import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  userId: text("user_id").unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  inviteToken: text("invite_token").unique(),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
  passwordResetToken: text("password_reset_token").unique(),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
  tokenBalance: integer("token_balance").notNull().default(0),
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  status: text("status", { enum: ["active", "suspended", "invited"] }).notNull().default("invited"),
  portalSubscriptionId: text("portal_subscription_id"),
  portalSubscriptionStatus: text("portal_subscription_status", {
    enum: ["none", "trialing", "active", "past_due", "canceled", "incomplete"],
  })
    .notNull()
    .default("none"),
  portalCurrentPeriodEnd: timestamp("portal_current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
