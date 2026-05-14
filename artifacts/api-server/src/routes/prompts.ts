import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, promptSessionsTable, organizationsTable } from "@workspace/db";
import {
  ListMyPromptsQueryParams,
  ListMyPromptsResponse,
  SubmitPromptBody,
  SubmitPromptResponse,
  GetPromptParams,
  GetPromptResponse,
  PublishPromptParams,
  PublishPromptBody,
  PublishPromptResponse,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";
import { runClaudePrompt } from "../lib/anthropic";
import { computeChargedTokens } from "../lib/billing";

const router: IRouter = Router();

router.get("/prompts", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const params = ListMyPromptsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset } = params.data;
  const rows = await db
    .select()
    .from(promptSessionsTable)
    .where(eq(promptSessionsTable.organizationId, req.dbClient!.id))
    .orderBy(desc(promptSessionsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promptSessionsTable)
    .where(eq(promptSessionsTable.organizationId, req.dbClient!.id));
  res.json(ListMyPromptsResponse.parse({ data: rows, total: Number(count) }));
});

router.post("/prompts", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const parsed = SubmitPromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = req.dbClient!;
  if (client.tokenBalance <= 0) {
    res.status(402).json({ error: "Insufficient tokens. Please purchase a bundle.", tokenBalance: client.tokenBalance });
    return;
  }

  let result;
  try {
    result = await runClaudePrompt(parsed.data.prompt);
  } catch (err) {
    req.log.error({ err }, "Claude prompt failed");
    res.status(502).json({ error: "AI request failed. No tokens were charged." });
    return;
  }

  // Apply the client-facing token markup, then clamp to the remaining balance
  // so we never overdraw. See lib/billing.ts for the multiplier.
  const tokensUsed = computeChargedTokens(result.totalTokens, client.tokenBalance);
  const [updatedClient] = await db
    .update(organizationsTable)
    .set({
      tokenBalance: sql`GREATEST(${organizationsTable.tokenBalance} - ${tokensUsed}, 0)`,
      totalTokensUsed: sql`${organizationsTable.totalTokensUsed} + ${tokensUsed}`,
    })
    .where(eq(organizationsTable.id, client.id))
    .returning();

  const [session] = await db
    .insert(promptSessionsTable)
    .values({
      organizationId: client.id,
      prompt: parsed.data.prompt,
      output: result.output,
      tokensUsed,
      model: result.model,
    })
    .returning();

  req.log.info(
    {
      sessionId: session.id,
      rawTokens: result.totalTokens,
      tokensUsed,
      balance: updatedClient.tokenBalance,
    },
    "Prompt completed",
  );

  res.json(SubmitPromptResponse.parse(session));
});

router.get("/prompts/:id", requireAuth, loadOrCreateClient, async (req, res): Promise<void> => {
  const params = GetPromptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(promptSessionsTable)
    .where(and(eq(promptSessionsTable.id, params.data.id), eq(promptSessionsTable.organizationId, req.dbClient!.id)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(GetPromptResponse.parse(row));
});

router.post(
  "/prompts/:id/publish",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = PublishPromptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = PublishPromptBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const published = body.data.published ?? true;

    const [existing] = await db
      .select()
      .from(promptSessionsTable)
      .where(
        and(
          eq(promptSessionsTable.id, params.data.id),
          eq(promptSessionsTable.organizationId, req.dbClient!.id),
        ),
      );

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const nextPublishedAt = published
      ? (existing.publishedAt ?? new Date())
      : null;

    const [updated] = await db
      .update(promptSessionsTable)
      .set({
        isPublished: published,
        publishedAt: nextPublishedAt,
      })
      .where(
        and(
          eq(promptSessionsTable.id, params.data.id),
          eq(promptSessionsTable.organizationId, req.dbClient!.id),
        ),
      )
      .returning();

    req.log.info(
      { sessionId: updated.id, published },
      published ? "Prompt published" : "Prompt unpublished",
    );
    res.json(PublishPromptResponse.parse(updated));
  },
);

export default router;
