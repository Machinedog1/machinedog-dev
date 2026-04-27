import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (t) => ({
    clientIdx: index("sessions_client_idx").on(t.clientId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export type Session = typeof sessionsTable.$inferSelect;
