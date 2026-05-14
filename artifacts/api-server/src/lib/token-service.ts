import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  organizationsTable,
  clientsTable,
  tokenLedgerTable,
  type TokenLedger,
} from "@workspace/db";
import { recordAuditEvent } from "./audit";

export type TokenLedgerType = TokenLedger["type"];
export type TokenLedgerSource = TokenLedger["source"];

interface MutationOpts {
  userId?: number | null;
  projectId?: number | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Stripe event id for idempotency. If a row with this id already exists,
   *  we return that row instead of inserting a duplicate. */
  stripeEventId?: string | null;
  source?: TokenLedgerSource;
}

interface MutationResult {
  ledger: TokenLedger;
  balanceAfter: number;
  /** True when this call was a no-op because the stripeEventId had already been processed. */
  duplicate: boolean;
}

/**
 * Centralized token mutation API. All callers go through here so the ledger
 * stays append-only, balances stay consistent, and audit events fire on every
 * change. Mutations run inside a SERIALIZABLE-ish transaction with a row lock
 * on the legacy clients row (the source of truth for `tokenBalance` until the
 * org-cutover) so concurrent deductions cannot double-spend.
 *
 * Phase 1 stores balance on `clients.tokenBalance` (legacy) AND mirrors every
 * change to the org-scoped ledger. Once Phase 0 cutover lands, the legacy
 * column will be retired in favor of a derived balance from the ledger.
 */
async function mutate(
  organizationId: number,
  type: TokenLedgerType,
  amount: number,
  opts: MutationOpts = {},
): Promise<MutationResult> {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error(`Invalid token amount: ${amount}`);
  }

  return await db.transaction(async (tx) => {
    // Resolve the legacy clientId backing this org so we know which row to
    // lock. The lock is acquired BEFORE the idempotency re-check so that
    // concurrent duplicate-webhook workers serialize on the same row: the
    // loser blocks on the lock, then sees the winner's committed ledger
    // row when it re-checks under its own lock. This is what makes
    // stripeEventId truly idempotent under concurrency without relying on
    // the unique-violation rollback (which would also undo the balance
    // update we already applied in this transaction).
    const [org] = await tx
      .select({ id: organizationsTable.id, legacyClientId: organizationsTable.legacyClientId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);
    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    // Acquire the row lock that scopes balance reads/writes for this org.
    let lockedClientRow: { id: number; token_balance: number } | null = null;
    if (org.legacyClientId) {
      const lockedRows = await tx.execute(
        sql`SELECT id, token_balance FROM clients WHERE id = ${org.legacyClientId} FOR UPDATE`,
      );
      lockedClientRow = (lockedRows.rows?.[0] ?? null) as
        | { id: number; token_balance: number }
        | null;
      if (!lockedClientRow) {
        throw new Error(`Backing client ${org.legacyClientId} not found`);
      }
    } else {
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`,
      );
    }

    // Idempotency re-check UNDER the lock. If a concurrent worker already
    // applied this stripe event, return its row without touching balances.
    if (opts.stripeEventId) {
      const [existing] = await tx
        .select()
        .from(tokenLedgerTable)
        .where(eq(tokenLedgerTable.stripeEventId, opts.stripeEventId))
        .limit(1);
      if (existing) {
        return { ledger: existing, balanceAfter: existing.balanceAfter, duplicate: true };
      }
    }

    let balanceAfter: number;
    if (org.legacyClientId && lockedClientRow) {
      const current = Number(lockedClientRow.token_balance) || 0;
      const next = current + amount;
      if (next < 0) {
        throw new Error(`Insufficient token balance (have ${current}, need ${-amount})`);
      }
      const totalUsedDelta = amount < 0 ? -amount : 0;
      await tx
        .update(clientsTable)
        .set({
          tokenBalance: next,
          totalTokensUsed: sql`${clientsTable.totalTokensUsed} + ${totalUsedDelta}`,
        })
        .where(eq(clientsTable.id, org.legacyClientId));
      balanceAfter = next;
    } else {
      const [{ sum }] = (await tx.execute(
        sql`SELECT COALESCE(SUM(amount), 0)::int AS sum FROM token_ledger WHERE organization_id = ${organizationId}`,
      )).rows as Array<{ sum: number }>;
      const current = Number(sum) || 0;
      const next = current + amount;
      if (next < 0) {
        throw new Error(`Insufficient token balance (have ${current}, need ${-amount})`);
      }
      balanceAfter = next;
    }

    const [ledger] = await tx
      .insert(tokenLedgerTable)
      .values({
        organizationId,
        userId: opts.userId ?? null,
        projectId: opts.projectId ?? null,
        type,
        amount,
        balanceAfter,
        description: opts.description ?? null,
        metadata: opts.metadata ?? null,
        stripeEventId: opts.stripeEventId ?? null,
        source: opts.source ?? "system",
      })
      .returning();
    return { ledger, balanceAfter, duplicate: false };
  });
}

export async function getBalance(organizationId: number): Promise<number> {
  const [org] = await db
    .select({ legacyClientId: organizationsTable.legacyClientId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId))
    .limit(1);
  if (!org) return 0;
  if (org.legacyClientId) {
    const [c] = await db
      .select({ balance: clientsTable.tokenBalance })
      .from(clientsTable)
      .where(eq(clientsTable.id, org.legacyClientId))
      .limit(1);
    return c?.balance ?? 0;
  }
  const [{ sum }] = (await db.execute(
    sql`SELECT COALESCE(SUM(amount), 0)::int AS sum FROM token_ledger WHERE organization_id = ${organizationId}`,
  )).rows as Array<{ sum: number }>;
  return Number(sum) || 0;
}

export async function grantMonthly(
  organizationId: number,
  amount: number,
  opts: MutationOpts = {},
): Promise<MutationResult> {
  const result = await mutate(organizationId, "grant_monthly", Math.abs(amount), {
    ...opts,
    description: opts.description ?? `Monthly plan token grant: ${amount}`,
  });
  await recordAuditEvent({
    organizationId,
    actorClientId: opts.userId ?? null,
    category: "tokens",
    action: "grant.monthly",
    targetType: "ledger",
    targetId: String(result.ledger.id),
    metadata: { amount, balanceAfter: result.balanceAfter, duplicate: result.duplicate },
  });
  return result;
}

export async function recordPurchase(
  organizationId: number,
  amount: number,
  opts: MutationOpts = {},
): Promise<MutationResult> {
  const result = await mutate(organizationId, "purchase_pack", Math.abs(amount), {
    ...opts,
    description: opts.description ?? `Token pack purchase: +${amount}`,
  });
  await recordAuditEvent({
    organizationId,
    actorClientId: opts.userId ?? null,
    category: "tokens",
    action: "purchase.completed",
    targetType: "ledger",
    targetId: String(result.ledger.id),
    metadata: { amount, balanceAfter: result.balanceAfter, duplicate: result.duplicate },
  });
  return result;
}

export type DeductCategory = "ai" | "build" | "deploy" | "template" | "other";

export async function deduct(
  organizationId: number,
  amount: number,
  category: DeductCategory,
  opts: MutationOpts = {},
): Promise<MutationResult> {
  const type: TokenLedgerType =
    category === "ai"
      ? "deduct_ai"
      : category === "build"
        ? "deduct_build"
        : category === "deploy"
          ? "deduct_deploy"
          : category === "template"
            ? "deduct_template"
            : "deduct_other";
  const result = await mutate(organizationId, type, -Math.abs(amount), {
    ...opts,
    description: opts.description ?? `Token deduction (${category}): -${amount}`,
  });
  await recordAuditEvent({
    organizationId,
    actorClientId: opts.userId ?? null,
    category: "tokens",
    action: `deduct.${category}`,
    targetType: "ledger",
    targetId: String(result.ledger.id),
    metadata: { amount, balanceAfter: result.balanceAfter },
  });
  return result;
}

export async function adminAdjust(
  organizationId: number,
  amount: number,
  opts: MutationOpts = {},
): Promise<MutationResult> {
  const result = await mutate(organizationId, "admin_adjust", amount, {
    ...opts,
    source: opts.source ?? "admin",
    description: opts.description ?? `Admin adjustment: ${amount}`,
  });
  await recordAuditEvent({
    organizationId,
    actorClientId: opts.userId ?? null,
    category: "tokens",
    action: "admin.adjust",
    targetType: "ledger",
    targetId: String(result.ledger.id),
    metadata: { amount, balanceAfter: result.balanceAfter },
  });
  return result;
}

export async function listLedger(
  organizationId: number,
  limit = 200,
): Promise<TokenLedger[]> {
  return await db
    .select()
    .from(tokenLedgerTable)
    .where(eq(tokenLedgerTable.organizationId, organizationId))
    .orderBy(desc(tokenLedgerTable.createdAt))
    .limit(limit);
}

export interface UsageBucket {
  category: DeductCategory | "purchase" | "grant" | "admin";
  totalAmount: number;
  count: number;
}

export async function usageByCategory(organizationId: number): Promise<UsageBucket[]> {
  const rows = await db
    .select({
      type: tokenLedgerTable.type,
      total: sql<number>`COALESCE(SUM(${tokenLedgerTable.amount}), 0)::int`,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(tokenLedgerTable)
    .where(eq(tokenLedgerTable.organizationId, organizationId))
    .groupBy(tokenLedgerTable.type);

  const map: Record<string, UsageBucket> = {};
  for (const r of rows) {
    let key: UsageBucket["category"];
    switch (r.type) {
      case "deduct_ai":
        key = "ai";
        break;
      case "deduct_build":
        key = "build";
        break;
      case "deduct_deploy":
        key = "deploy";
        break;
      case "deduct_template":
        key = "template";
        break;
      case "deduct_other":
        key = "other";
        break;
      case "purchase_pack":
        key = "purchase";
        break;
      case "grant_monthly":
      case "grant_signup":
        key = "grant";
        break;
      case "admin_adjust":
      case "refund":
        key = "admin";
        break;
      default:
        key = "other";
    }
    const bucket = (map[key] ??= { category: key, totalAmount: 0, count: 0 });
    bucket.totalAmount += Number(r.total) || 0;
    bucket.count += Number(r.cnt) || 0;
  }
  return Object.values(map).sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));
}

