import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const consultingBookingsTable = pgTable("consulting_bookings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  packageKey: text("package_key").notNull(),
  hoursTotal: integer("hours_total").notNull(),
  hoursUsed: integer("hours_used").notNull().default(0),
  status: text("status", { enum: ["pending", "active", "completed"] }).notNull().default("pending"),
  stripeSessionId: text("stripe_session_id"),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConsultingBookingSchema = createInsertSchema(consultingBookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConsultingBooking = z.infer<typeof insertConsultingBookingSchema>;
export type ConsultingBooking = typeof consultingBookingsTable.$inferSelect;
