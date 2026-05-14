import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  organizationsTable,
  tokenLedgerTable,
  type TokenLedger,
} from "@workspace/db";
import { recordAuditEvent } from "./audit";

export type TokenLedgerType = TokenLedger["type"];
export type TokenLedgerSource = TokenLedger["source"];

interface MutationOpts {
  /** Organization id of the actor (often same as the target org). */
  actorOrganizationId?: number | null;
  projectId?: number | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Stripe event id for idempotency. */
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
 * Centralized token mutation API. Source of truth is `organizations.token_balance`.
 * Each mutation acquires a row lock on the org and re-checks idempotency under
 * the lock so concurrent duplicate-webhook workers serialize safely.
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
    const lockedRows = await tx.execute(
      sql`SELECT id, token_balance FROM organizations WHERE id = ${organizationId} FOR UPDATE`,
    );
    const lockedOrg = (lockedRows.rows?.[0] ?? null) as
      | { id: number; token_balance: number }
      | null;
    if (!lockedOrg) {
      throw new Error(`Organization ${organizationId} not found`);
    }

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

    const current = Number(lockedOrg.token_balance) || 0;
    const next = current + amount;
    if (next < 0) {
      throw new Error(`Insufficient token balance (have ${current}, need ${-amount})`);
    }
    const totalUsedDelta = amount < 0 ? -amount : 0;
    await tx
      .update(organizationsTable)
      .set({
        tokenBalance: next,
        totalTokensUsed: sql`${organizationsTable.totalTokensUsed} + ${totalUsedDelta}`,
      })
      .where(eq(organizationsTable.id, organizationId));
    const balanceAfter = next;

    const [ledger] = await tx
      .insert(tokenLedgerTable)
      .values({
        organizationId,
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
    .select({ balance: organizationsTable.tokenBalance })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId))
    .limit(1);
  return org?.balance ?? 0;
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
    actorOrganizationId: opts.actorOrganizationId ?? null,
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
    actorOrganizationId: opts.actorOrganizationId ?? null,
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
    actorOrganizationId: opts.actorOrganizationId ?? null,
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
    actorOrganizationId: opts.actorOrganizationId ?? null,
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
