import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { AI_MODEL_CATEGORIES } from "./ai-models";

/**
 * Phase 4: AI console conversation. One row per chat thread inside the
 * workspace AI console. Conversations are scoped to a project so the AI
 * service has stable project context to ground every prompt.
 */
export const aiConversationsTable = pgTable(
  "ai_conversations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").references(
      () => organizationsTable.id,
      { onDelete: "cascade" },
    ),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    createdByClientId: integer("created_by_client_id")
      .notNull()
      .references(() => organizationsTable.id),
    title: text("title").notNull().default("New conversation"),
    /** Last category used in this conversation — drives the mode selector
     *  default when the user re-opens the thread. */
    lastCategory: text("last_category", { enum: AI_MODEL_CATEGORIES })
      .notNull()
      .default("coding"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    projectIdx: index("ai_conversations_project_idx").on(
      t.projectId,
      t.updatedAt,
    ),
  }),
);

export const insertAiConversationSchema = createInsertSchema(
  aiConversationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;
export type AiConversation = typeof aiConversationsTable.$inferSelect;

export const AI_MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

export const aiMessagesTable = pgTable(
  "ai_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => aiConversationsTable.id, { onDelete: "cascade" }),
    role: text("role", { enum: AI_MESSAGE_ROLES }).notNull(),
    content: text("content").notNull(),
    /** Snapshot of the model + category that produced this assistant message
     *  (null on user messages). Lets the UI display which model answered. */
    providerSlug: text("provider_slug"),
    modelKey: text("model_key"),
    category: text("category", { enum: AI_MODEL_CATEGORIES }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    tokenCost: integer("token_cost"),
    /** Structured metadata: PHI block reason, gating-failed preconditions,
     *  mock flag, etc. */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    conversationIdx: index("ai_messages_conversation_idx").on(
      t.conversationId,
      t.createdAt,
    ),
  }),
);

export const insertAiMessageSchema = createInsertSchema(aiMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
export type AiMessage = typeof aiMessagesTable.$inferSelect;

export const AI_PROPOSED_CHANGE_OPS = [
  "create",
  "update",
  "delete",
  "rename",
] as const;
export type AiProposedChangeOp = (typeof AI_PROPOSED_CHANGE_OPS)[number];

export const AI_PROPOSED_CHANGE_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type AiProposedChangeStatus =
  (typeof AI_PROPOSED_CHANGE_STATUSES)[number];

/**
 * Phase 4: per-file proposed change emitted by an assistant message.
 * Rendered as a diff card in the console; user accepts/rejects per file.
 * Accepting writes to project_files and (optionally) commits to the active
 * branch via the existing GitHub helper, or opens a change request.
 */
export const aiProposedChangesTable = pgTable(
  "ai_proposed_changes",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => aiConversationsTable.id, { onDelete: "cascade" }),
    messageId: integer("message_id")
      .notNull()
      .references(() => aiMessagesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    op: text("op", { enum: AI_PROPOSED_CHANGE_OPS }).notNull(),
    path: text("path").notNull(),
    /** For renames: the new path. Null otherwise. */
    newPath: text("new_path"),
    /** Full file contents proposed by the AI for create/update. Null for
     *  delete. Stored as text — the workspace file tree is text-only. */
    contents: text("contents"),
    /** Snapshot of the previous file contents at the time the proposal was
     *  generated; lets the diff viewer render before/after without re-reading
     *  from the workspace (which may have changed by the time the user
     *  accepts). */
    previousContents: text("previous_contents"),
    status: text("status", { enum: AI_PROPOSED_CHANGE_STATUSES })
      .notNull()
      .default("pending"),
    /** When accepted, the client who clicked accept and what they did with it
     *  (`commit` = direct workspace commit, `change_request` = routed through
     *  the canonical CR pipeline). */
    appliedByClientId: integer("applied_by_client_id").references(
      () => organizationsTable.id,
    ),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedAs: text("applied_as", { enum: ["commit", "change_request"] }),
    appliedChangeRequestId: integer("applied_change_request_id"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    conversationIdx: index("ai_proposed_changes_conversation_idx").on(
      t.conversationId,
    ),
    messageIdx: index("ai_proposed_changes_message_idx").on(t.messageId),
    statusIdx: index("ai_proposed_changes_status_idx").on(t.status),
  }),
);

export const insertAiProposedChangeSchema = createInsertSchema(
  aiProposedChangesTable,
).omit({ id: true, createdAt: true });
export type InsertAiProposedChange = z.infer<
  typeof insertAiProposedChangeSchema
>;
export type AiProposedChange = typeof aiProposedChangesTable.$inferSelect;
