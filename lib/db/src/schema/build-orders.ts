import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BUILD_ORDER_KINDS = ["build", "retainer"] as const;
export const BUILD_ORDER_STATUSES = [
  "pending",
  "completed",
  "active",
  "cancelled",
] as const;

export const buildOrdersTable = pgTable(
  "build_orders",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: BUILD_ORDER_KINDS }).notNull(),
    email: text("email"),
    name: text("name"),
    company: text("company"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    source: text("source").notNull().default("pricing-page"),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    status: text("status", { enum: BUILD_ORDER_STATUSES })
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    createdAtIdx: index("build_orders_created_at_idx").on(table.createdAt),
    statusIdx: index("build_orders_status_idx").on(table.status),
  }),
);

export const insertBuildOrderSchema = createInsertSchema(buildOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});
export type InsertBuildOrder = z.infer<typeof insertBuildOrderSchema>;
export type BuildOrder = typeof buildOrdersTable.$inferSelect;
