import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Phase 1: per-organization subscription state for the v1 plan tiers
 * (Starter / Pro / Business / Healthcare / Enterprise). One active row
 * per org at a time; historical rows are kept for audit.
 */
export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    planType: text("plan_type", {
      enum: ["starter", "pro", "business", "healthcare", "enterprise"],
    }).notNull(),
    billingInterval: text("billing_interval", { enum: ["monthly", "annual"] })
      .notNull()
      .default("monthly"),
    status: text("status", {
      enum: ["trialing", "active", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"],
    })
      .notNull()
      .default("incomplete"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: text("cancel_at_period_end").notNull().default("false"),
    // dev_mock when created via the demo flow (no Stripe configured)
    source: text("source", { enum: ["stripe", "dev_mock"] }).notNull().default("stripe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgIdx: index("subscriptions_org_idx").on(t.organizationId),
    statusIdx: index("subscriptions_status_idx").on(t.status),
  }),
);

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
