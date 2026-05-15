/**
 * Phase 4 — AI service. Single entrypoint that resolves a model from the
 * registry, runs the PHI guard, calls the provider adapter (only Anthropic
 * is wired for v1; other providers fall through to a labeled mock), and
 * records usage + audit events.
 *
 * The proposed-changes parser lives here too — providers are instructed to
 * emit a fenced JSON block with file-level changes, and the parser tolerates
 * either a full structured response or a plain assistant message.
 */

import { eq } from "drizzle-orm";
import {
  db,
  organizationsTable,
  projectsTable,
  aiUsageTable,
  aiProvidersTable,
  type AiModelCategory,
  type AiProvider,
  type AiModel,
  type Project,
  type Organization,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";
import { recordAuditEventAsync } from "./audit";
import { deduct, getBalance } from "./token-service";
import {
  resolveCategoryModel,
  hasEnabledProviders,
  computeTokenCost,
} from "./ai-registry";
import { scanForPhi, type PhiHit } from "./ai-phi-guard";

export interface AiSendInput {
  category: AiModelCategory;
  /** Conversation history — order matters; user/assistant alternation. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectContext: {
    title: string;
    description: string;
    summary: string;
    framework: string;
    githubOwner: string | null;
    githubRepo: string | null;
  };
  /** Optional callback invoked with each text delta as it arrives from the
   *  provider. Used by the SSE streaming route to forward tokens to the
   *  client in real time. Non-streaming callers can omit it. */
  onDelta?: (delta: string) => void;
}

export interface ProposedFileChange {
  op: "create" | "update" | "delete" | "rename";
  path: string;
  newPath?: string;
  contents?: string;
  rationale?: string;
}

export interface AiSendResult {
  ok: boolean;
  status: "ok" | "blocked_phi" | "blocked_healthcare" | "insufficient_tokens" | "error";
  /** Always present: the assistant text rendered in the chat thread. */
  text: string;
  proposedChanges: ProposedFileChange[];
  providerSlug: string;
  modelKey: string;
  category: AiModelCategory;
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
  mocked: boolean;
  /** When status != ok, structured info for the UI to render the block. */
  blockReason?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

const SYSTEM_PROMPT = `You are Machinedog's in-workspace AI coding assistant.

You have access to the user's project context (name, framework, description). When the user asks for code changes, respond with:
1. A brief, plain-language explanation (1-3 sentences) of what you're going to do.
2. A single fenced JSON block labeled \`\`\`machinedog-changes containing an array of file changes:

\`\`\`machinedog-changes
{
  "summary": "one sentence describing the change set",
  "changes": [
    { "op": "create" | "update" | "delete" | "rename",
      "path": "relative/path/to/file",
      "newPath": "(only for rename)",
      "contents": "FULL new file contents (for create/update)",
      "rationale": "one sentence"
    }
  ]
}
\`\`\`

Rules:
- Only emit the JSON block when you are actually proposing file changes. Pure Q&A answers should omit it.
- Provide FULL file contents for create/update — never diffs.
- Keep changes minimal and focused on what the user asked for.
- Do not invent secrets or absolute paths.
- Never include explanations inside the JSON block.`;

interface HealthcareGateContext {
  org: Organization | null;
  project: Project;
}

interface HealthcareGateResult {
  ok: boolean;
  failedPreconditions: string[];
}

/** Server-side check that all four healthcare-safe preconditions are met. */
export function checkHealthcareGating(
  ctx: HealthcareGateContext,
): HealthcareGateResult {
  const failed: string[] = [];
  const planType = ctx.org?.planType ?? "free";
  if (planType !== "healthcare" && planType !== "enterprise") {
    failed.push(`org.planType must be healthcare or enterprise (is ${planType})`);
  }
  const orgBaa = ctx.org?.baaStatus ?? "not_required";
  // The existing enum's "active" value is the signed/effective state.
  if (orgBaa !== "active") {
    failed.push(`org.baaStatus must be active (signed BAA) (is ${orgBaa})`);
  }
  // HIPAA deployment posture must be operator-approved on the org. This is
  // independent from the project-level `phiAllowed` toggle — both must be
  // true to enter the healthcare-safe lane.
  const orgHipaa = ctx.org?.hipaaDeploymentStatus ?? "not_required";
  if (orgHipaa !== "approved") {
    failed.push(
      `org.hipaaDeploymentStatus must be approved (HIPAA deployment approved) (is ${orgHipaa})`,
    );
  }
  if (!ctx.project.phiAllowed) {
    failed.push("project.phiAllowed must be true (project PHI mode enabled)");
  }
  return { ok: failed.length === 0, failedPreconditions: failed };
}

interface AutoRouteContext {
  promptText: string;
  totalContextChars: number;
  project: Project;
  org: Organization | null;
}

/** Decide which concrete category an `auto` request should resolve to. */
export function autoRouteCategory(ctx: AutoRouteContext): AiModelCategory {
  const planType = ctx.org?.planType ?? "free";
  // Healthcare projects automatically prefer the healthcare-safe lane when
  // the project is set up to allow PHI.
  if (
    ctx.project.healthcareMode &&
    ctx.project.phiAllowed &&
    (planType === "healthcare" || planType === "enterprise")
  ) {
    return "healthcare_safe";
  }
  // ~4 chars/token rough heuristic: anything past ~40k tokens of context wants
  // the long-context lane.
  if (ctx.totalContextChars > 160_000) return "long_context";
  // Tiny / chatty prompts go to the fast lane.
  if (ctx.promptText.trim().length < 240) return "fast";
  // Mention-of-architecture keywords → architect.
  if (
    /\b(refactor|migrate|architect|schema migration|repo-wide|security review|threat model)\b/i.test(
      ctx.promptText,
    )
  ) {
    return "architect";
  }
  return "coding";
}

async function loadOrgForProject(
  project: Project,
): Promise<Organization | null> {
  if (!project.organizationId) return null;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, project.organizationId))
    .limit(1);
  return org ?? null;
}

interface RecordUsageOpts {
  organizationId: number | null;
  projectId: number;
  userClientId: number;
  provider: AiProvider | null;
  model: AiModel | null;
  providerSlug: string;
  modelKey: string;
  category: AiModelCategory;
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
  blockedForPhi?: boolean;
  blockedForHealthcareGating?: boolean;
  mocked?: boolean;
  status: "ok" | "error" | "blocked";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

async function recordUsage(opts: RecordUsageOpts): Promise<void> {
  try {
    await db.insert(aiUsageTable).values({
      organizationId: opts.organizationId,
      projectId: opts.projectId,
      userClientId: opts.userClientId,
      providerId: opts.provider?.id ?? null,
      modelId: opts.model?.id ?? null,
      providerSlug: opts.providerSlug,
      modelKey: opts.modelKey,
      category: opts.category,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      tokenCost: opts.tokenCost,
      blockedForPhi: opts.blockedForPhi ?? false,
      blockedForHealthcareGating: opts.blockedForHealthcareGating ?? false,
      mocked: opts.mocked ?? false,
      status: opts.status,
      errorMessage: opts.errorMessage ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    logger.error({ err }, "ai-service: failed to record usage row");
  }
}

const CHANGES_FENCE = /```machinedog-changes\s*([\s\S]*?)```/i;

/** Extract the structured change-set from the assistant's text. Returns
 *  the parsed changes plus the human-readable text with the JSON block
 *  stripped out. */
export function extractProposedChanges(text: string): {
  text: string;
  changes: ProposedFileChange[];
} {
  const match = text.match(CHANGES_FENCE);
  if (!match) return { text, changes: [] };
  const stripped = text.replace(CHANGES_FENCE, "").trim();
  let parsed: { changes?: unknown } | null = null;
  try {
    parsed = JSON.parse(match[1]!.trim());
  } catch (err) {
    logger.warn({ err }, "ai-service: failed to parse machinedog-changes block");
    return { text: stripped, changes: [] };
  }
  const arr = Array.isArray(parsed?.changes) ? parsed.changes : [];
  const out: ProposedFileChange[] = [];
  for (const raw of arr as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const op = r.op as ProposedFileChange["op"];
    if (op !== "create" && op !== "update" && op !== "delete" && op !== "rename") {
      continue;
    }
    const path = typeof r.path === "string" ? r.path.replace(/^\/+/, "") : "";
    if (!path) continue;
    const change: ProposedFileChange = { op, path };
    if (typeof r.newPath === "string") {
      change.newPath = r.newPath.replace(/^\/+/, "");
    }
    if (typeof r.contents === "string") change.contents = r.contents;
    if (typeof r.rationale === "string") change.rationale = r.rationale;
    out.push(change);
  }
  return { text: stripped, changes: out };
}

function buildProjectContextString(p: AiSendInput["projectContext"]): string {
  const repo =
    p.githubOwner && p.githubRepo
      ? `${p.githubOwner}/${p.githubRepo}`
      : "(no GitHub repo configured)";
  return [
    `# Project context`,
    `- Title: ${p.title}`,
    `- Framework: ${p.framework}`,
    `- Repo: ${repo}`,
    `- Description: ${p.description || "(none)"}`,
    `- Summary: ${p.summary || "(none)"}`,
  ].join("\n");
}

function makeMockResponse(
  category: AiModelCategory,
  lastUserMessage: string,
): { text: string; changes: ProposedFileChange[] } {
  const text = [
    `**[mock provider — no AI providers are enabled in this Machinedog instance]**`,
    ``,
    `Asked in **${category}** mode:`,
    `> ${lastUserMessage.slice(0, 240)}`,
    ``,
    `An admin can enable an AI provider at \`/admin/ai-models\`. Until then, this is a deterministic stub.`,
  ].join("\n");
  return { text, changes: [] };
}

interface SendDeps {
  organizationId: number | null;
  projectId: number;
  userClientId: number;
  project: Project;
  org: Organization | null;
}

export interface PhiPreflightResult {
  blocked: boolean;
  /** Stable rule identifiers (no offending text) safe to log. */
  rules: string[];
  /** Human-readable labels (no offending text) for the user-facing message. */
  labels: string[];
  /** Sanitized message body to surface to the user when blocked. */
  blockedMessage: string;
}

/**
 * Run the PHI guard against the CURRENT turn's prompt only, BEFORE the
 * caller persists the user message or calls aiSend. This guarantees PHI
 * never lands in `ai_messages.content` when the project is not phiAllowed.
 *
 * Routes are expected to:
 *   - call this first
 *   - if blocked, persist a sanitized placeholder (NOT the raw prompt) and
 *     record audit/usage events using the returned rule identifiers
 *   - if not blocked, persist the user message and call aiSend()
 */
export async function phiPreflight(
  promptText: string,
  deps: Pick<SendDeps, "organizationId" | "projectId" | "userClientId" | "project">,
): Promise<PhiPreflightResult> {
  if (deps.project.phiAllowed) {
    return { blocked: false, rules: [], labels: [], blockedMessage: "" };
  }
  const scan = scanForPhi(promptText);
  if (!scan.blocked) {
    return { blocked: false, rules: [], labels: [], blockedMessage: "" };
  }
  const rules = scan.hits.map((h) => h.rule);
  const labels = scan.hits.map((h: PhiHit) => h.label);
  const blockedMessage = [
    `**PHI guard blocked this prompt.**`,
    ``,
    `Detected: ${labels.join(", ")}.`,
    ``,
    `This project does not have PHI access enabled. To work with PHI you'll need a healthcare plan, a signed BAA, and the project's PHI mode turned on.`,
  ].join("\n");
  await recordUsage({
    organizationId: deps.organizationId,
    projectId: deps.projectId,
    userClientId: deps.userClientId,
    provider: null,
    model: null,
    providerSlug: "n/a",
    modelKey: "n/a",
    category: "auto",
    inputTokens: 0,
    outputTokens: 0,
    tokenCost: 0,
    blockedForPhi: true,
    status: "blocked",
    errorMessage: "phi_blocked",
    metadata: { rules, stage: "preflight", contentLength: promptText.length },
  });
  recordAuditEventAsync({
    organizationId: deps.organizationId,
    actorOrganizationId: deps.userClientId,
    category: "ai",
    action: "phi_blocked",
    targetType: "project",
    targetId: String(deps.projectId),
    // Metadata MUST contain only rule identifiers + content length — never
    // the offending text itself.
    metadata: { rules, stage: "preflight", contentLength: promptText.length },
  });
  return { blocked: true, rules, labels, blockedMessage };
}

export async function aiSend(
  input: AiSendInput,
  deps: SendDeps,
): Promise<AiSendResult> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser?.content ?? "";
  const totalContextChars = input.messages.reduce(
    (acc, m) => acc + (m.content?.length ?? 0),
    0,
  );

  // 1. Resolve auto → concrete category.
  const concreteCategory: AiModelCategory =
    input.category === "auto"
      ? autoRouteCategory({
          promptText: lastUserText,
          totalContextChars,
          project: deps.project,
          org: deps.org,
        })
      : input.category;

  // 2. Healthcare-safe gating runs BEFORE PHI guard so the gating-failure
  //    message is shown instead of a misleading PHI block.
  if (concreteCategory === "healthcare_safe") {
    const gate = checkHealthcareGating({ org: deps.org, project: deps.project });
    if (!gate.ok) {
      const text = [
        `Healthcare-Safe lane is locked. Failed preconditions:`,
        ...gate.failedPreconditions.map((p) => `- ${p}`),
      ].join("\n");
      await recordUsage({
        organizationId: deps.organizationId,
        projectId: deps.projectId,
        userClientId: deps.userClientId,
        provider: null,
        model: null,
        providerSlug: "n/a",
        modelKey: "n/a",
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        blockedForHealthcareGating: true,
        status: "blocked",
        errorMessage: "healthcare_gating_failed",
        metadata: { failedPreconditions: gate.failedPreconditions },
      });
      recordAuditEventAsync({
        organizationId: deps.organizationId,
        actorOrganizationId: deps.userClientId,
        category: "ai",
        action: "healthcare_gating_blocked",
        targetType: "project",
        targetId: String(deps.projectId),
        metadata: { failedPreconditions: gate.failedPreconditions },
      });
      return {
        ok: false,
        status: "blocked_healthcare",
        text,
        proposedChanges: [],
        providerSlug: "n/a",
        modelKey: "n/a",
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        mocked: false,
        blockReason: {
          code: "healthcare_gating_failed",
          message: "Healthcare-Safe lane is not available for this project.",
          details: { failedPreconditions: gate.failedPreconditions },
        },
      };
    }
  }

  // 3. PHI guard runs server-side on ONLY the current turn's prompt (the
  //    latest user message) when the project is NOT phiAllowed. Scanning
  //    the full conversation history would create sticky cross-turn blocks
  //    where a clean follow-up is rejected because of an earlier prompt;
  //    routes already call `phiPreflight` before persisting a new turn, so
  //    by the time we reach this in-service check we only need to defend
  //    the current turn.
  if (!deps.project.phiAllowed) {
    const scan = scanForPhi(lastUserText);
    if (scan.blocked) {
      const text = [
        `**PHI guard blocked this prompt.**`,
        ``,
        `Detected: ${scan.hits.map((h: PhiHit) => h.label).join(", ")}.`,
        ``,
        `This project does not have PHI access enabled. To work with PHI you'll need a healthcare plan, a signed BAA, and the project's PHI mode turned on.`,
      ].join("\n");
      await recordUsage({
        organizationId: deps.organizationId,
        projectId: deps.projectId,
        userClientId: deps.userClientId,
        provider: null,
        model: null,
        providerSlug: "n/a",
        modelKey: "n/a",
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        blockedForPhi: true,
        status: "blocked",
        errorMessage: "phi_blocked",
        metadata: {
          rules: scan.hits.map((h) => h.rule),
          contentLength: lastUserText.length,
        },
      });
      recordAuditEventAsync({
        organizationId: deps.organizationId,
        actorOrganizationId: deps.userClientId,
        category: "ai",
        action: "phi_blocked",
        targetType: "project",
        targetId: String(deps.projectId),
        // Metadata MUST contain only rule labels + content length — never
        // the offending text itself.
        metadata: {
          rules: scan.hits.map((h) => h.rule),
          contentLength: lastUserText.length,
        },
      });
      return {
        ok: false,
        status: "blocked_phi",
        text,
        proposedChanges: [],
        providerSlug: "n/a",
        modelKey: "n/a",
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        mocked: false,
        blockReason: {
          code: "phi_blocked",
          message: "Prompt contains content that looks like PHI.",
          details: { rules: scan.hits.map((h) => h.rule) },
        },
      };
    }
  }

  // 4. Resolve a concrete model from the registry. If none, fall back to
  //    the labeled mock so dev / Replit demo keeps working.
  const resolved = await resolveCategoryModel(concreteCategory);

  // 4a. Preflight token-balance check. We estimate the worst-case cost
  //     using the resolved model's pricing (500 input + 4000 output is a
  //     conservative coding-call envelope) and reject with insufficient_tokens
  //     BEFORE we make a paid provider call. Mock fallback skips this since
  //     it's free.
  if (resolved && deps.organizationId) {
    const estimated = computeTokenCost(resolved.model, 500, 4000);
    const balance = await getBalance(deps.organizationId);
    if (balance < estimated) {
      await recordUsage({
        organizationId: deps.organizationId,
        projectId: deps.projectId,
        userClientId: deps.userClientId,
        provider: resolved.provider,
        model: resolved.model,
        providerSlug: resolved.provider.slug,
        modelKey: resolved.model.modelKey,
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        status: "blocked",
        errorMessage: "insufficient_tokens",
        metadata: { balance, estimated },
      });
      recordAuditEventAsync({
        organizationId: deps.organizationId,
        actorOrganizationId: deps.userClientId,
        category: "ai",
        action: "insufficient_tokens",
        targetType: "project",
        targetId: String(deps.projectId),
        metadata: { balance, estimated, modelKey: resolved.model.modelKey },
      });
      return {
        ok: false,
        status: "insufficient_tokens",
        text: `Not enough tokens to run this AI call. Estimated cost ~${estimated}, current balance ${balance}. Top up your token balance to continue.`,
        proposedChanges: [],
        providerSlug: resolved.provider.slug,
        modelKey: resolved.model.modelKey,
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        mocked: false,
        blockReason: {
          code: "insufficient_tokens",
          message: "Insufficient token balance for this AI call.",
          details: {
            balance,
            estimated,
            upsellUrl: "/app/tokens",
          },
        },
      };
    }
  }

  if (!resolved) {
    const enabledAny = await hasEnabledProviders();
    const mock = makeMockResponse(concreteCategory, lastUserText);
    await recordUsage({
      organizationId: deps.organizationId,
      projectId: deps.projectId,
      userClientId: deps.userClientId,
      provider: null,
      model: null,
      providerSlug: "mock",
      modelKey: "mock",
      category: concreteCategory,
      inputTokens: 0,
      outputTokens: 0,
      tokenCost: 0,
      mocked: true,
      status: "ok",
      metadata: { enabledAnyProvider: enabledAny },
    });
    return {
      ok: true,
      status: "ok",
      text: mock.text,
      proposedChanges: mock.changes,
      providerSlug: "mock",
      modelKey: "mock",
      category: concreteCategory,
      inputTokens: 0,
      outputTokens: 0,
      tokenCost: 0,
      mocked: true,
    };
  }

  // 5. Call the provider. v1 wires Anthropic; the rest fall through to the
  //    Anthropic adapter via the integration proxy if the model is
  //    cross-tagged, otherwise they record an error and surface a friendly
  //    message. Operator can mark a non-anthropic model disabled until we
  //    wire its adapter.
  const projectContextStr = buildProjectContextString(input.projectContext);

  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const adapterResult = await callProviderAdapter({
      providerSlug: resolved.provider.slug,
      modelKey: resolved.model.modelKey,
      systemPrompt: `${SYSTEM_PROMPT}\n\n${projectContextStr}`,
      messages: input.messages,
      onDelta: input.onDelta,
    });
    if (!adapterResult.ok) {
      await recordUsage({
        organizationId: deps.organizationId,
        projectId: deps.projectId,
        userClientId: deps.userClientId,
        provider: resolved.provider,
        model: resolved.model,
        providerSlug: resolved.provider.slug,
        modelKey: resolved.model.modelKey,
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        status: "error",
        errorMessage: adapterResult.code,
      });
      return {
        ok: false,
        status: "error",
        text: adapterResult.message,
        proposedChanges: [],
        providerSlug: resolved.provider.slug,
        modelKey: resolved.model.modelKey,
        category: concreteCategory,
        inputTokens: 0,
        outputTokens: 0,
        tokenCost: 0,
        mocked: false,
        blockReason: { code: adapterResult.code, message: adapterResult.message },
      };
    }
    assistantText = adapterResult.text;
    inputTokens = adapterResult.inputTokens;
    outputTokens = adapterResult.outputTokens;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, providerSlug: resolved.provider.slug, modelKey: resolved.model.modelKey },
      "ai-service: provider call failed",
    );
    await recordUsage({
      organizationId: deps.organizationId,
      projectId: deps.projectId,
      userClientId: deps.userClientId,
      provider: resolved.provider,
      model: resolved.model,
      providerSlug: resolved.provider.slug,
      modelKey: resolved.model.modelKey,
      category: concreteCategory,
      inputTokens: 0,
      outputTokens: 0,
      tokenCost: 0,
      status: "error",
      errorMessage: message,
    });
    return {
      ok: false,
      status: "error",
      text: `Provider call failed: ${message}`,
      proposedChanges: [],
      providerSlug: resolved.provider.slug,
      modelKey: resolved.model.modelKey,
      category: concreteCategory,
      inputTokens: 0,
      outputTokens: 0,
      tokenCost: 0,
      mocked: false,
      blockReason: { code: "provider_error", message },
    };
  }

  // 6. Parse proposed changes and compute cost.
  const parsed = extractProposedChanges(assistantText);
  const tokenCost = computeTokenCost(resolved.model, inputTokens, outputTokens);

  // 7. Deduct tokens. We preflighted in step 4a, but a concurrent call could
  //    still race the balance to zero. If the deduction fails here we treat
  //    it the same as the preflight failure and surface insufficient_tokens.
  let actualCost = tokenCost;
  if (deps.organizationId) {
    try {
      await deduct(deps.organizationId, tokenCost, "ai", {
        actorOrganizationId: deps.organizationId,
        projectId: deps.projectId,
        description: `AI call (${concreteCategory}, ${resolved.model.modelKey})`,
        metadata: { inputTokens, outputTokens },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err, organizationId: deps.organizationId, tokenCost },
        "ai-service: token deduction failed after provider call",
      );
      const balance = await getBalance(deps.organizationId);
      await recordUsage({
        organizationId: deps.organizationId,
        projectId: deps.projectId,
        userClientId: deps.userClientId,
        provider: resolved.provider,
        model: resolved.model,
        providerSlug: resolved.provider.slug,
        modelKey: resolved.model.modelKey,
        category: concreteCategory,
        inputTokens,
        outputTokens,
        tokenCost: 0,
        status: "blocked",
        errorMessage: "insufficient_tokens_post",
        metadata: { tokenCost, balance, error: message },
      });
      recordAuditEventAsync({
        organizationId: deps.organizationId,
        actorOrganizationId: deps.userClientId,
        category: "ai",
        action: "insufficient_tokens",
        targetType: "project",
        targetId: String(deps.projectId),
        metadata: { tokenCost, balance, error: message, race: true },
      });
      return {
        ok: false,
        status: "insufficient_tokens",
        text: `Not enough tokens to bill this AI call. Cost ${tokenCost}, balance ${balance}. Top up your token balance to continue.`,
        proposedChanges: [],
        providerSlug: resolved.provider.slug,
        modelKey: resolved.model.modelKey,
        category: concreteCategory,
        inputTokens,
        outputTokens,
        tokenCost: 0,
        mocked: false,
        blockReason: {
          code: "insufficient_tokens",
          message: "Insufficient token balance to bill this AI call.",
          details: { balance, tokenCost, upsellUrl: "/app/tokens" },
        },
      };
    }
  }

  await recordUsage({
    organizationId: deps.organizationId,
    projectId: deps.projectId,
    userClientId: deps.userClientId,
    provider: resolved.provider,
    model: resolved.model,
    providerSlug: resolved.provider.slug,
    modelKey: resolved.model.modelKey,
    category: concreteCategory,
    inputTokens,
    outputTokens,
    tokenCost: actualCost,
    status: "ok",
  });
  recordAuditEventAsync({
    organizationId: deps.organizationId,
    actorOrganizationId: deps.userClientId,
    category: "ai",
    action: "ai_prompt_submitted",
    targetType: "project",
    targetId: String(deps.projectId),
    metadata: {
      providerSlug: resolved.provider.slug,
      modelKey: resolved.model.modelKey,
      category: concreteCategory,
      inputTokens,
      outputTokens,
      tokenCost: actualCost,
      proposedChangeCount: parsed.changes.length,
    },
  });

  return {
    ok: true,
    status: "ok",
    text: parsed.text,
    proposedChanges: parsed.changes,
    providerSlug: resolved.provider.slug,
    modelKey: resolved.model.modelKey,
    category: concreteCategory,
    inputTokens,
    outputTokens,
    tokenCost: actualCost,
    mocked: false,
  };
}

// ─── Provider adapters ─────────────────────────────────────────────────────

interface AdapterOk {
  ok: true;
  text: string;
  inputTokens: number;
  outputTokens: number;
}
interface AdapterErr {
  ok: false;
  code: string;
  message: string;
}
type AdapterResult = AdapterOk | AdapterErr;

interface AdapterArgs {
  providerSlug: string;
  modelKey: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  onDelta?: (delta: string) => void;
}

async function callProviderAdapter(args: AdapterArgs): Promise<AdapterResult> {
  switch (args.providerSlug) {
    case "anthropic":
      return await callAnthropic(args);
    case "openai":
      return await callOpenAI(args);
    case "google":
      return await callGoogle(args);
    default:
      return {
        ok: false,
        code: "provider_adapter_missing",
        message: `Provider adapter not yet implemented: ${args.providerSlug}. Disable this model in /admin/ai-models or pick a different category default.`,
      };
  }
}

async function callAnthropic(args: AdapterArgs): Promise<AdapterResult> {
  if (args.onDelta) {
    const stream = anthropic.messages.stream({
      model: args.modelKey,
      max_tokens: 8192,
      system: args.systemPrompt,
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    let text = "";
    stream.on("text", (delta: string) => {
      text += delta;
      args.onDelta!(delta);
    });
    const final = await stream.finalMessage();
    return {
      ok: true,
      text,
      inputTokens: final.usage.input_tokens ?? 0,
      outputTokens: final.usage.output_tokens ?? 0,
    };
  }
  const response = await anthropic.messages.create({
    model: args.modelKey,
    max_tokens: 8192,
    system: args.systemPrompt,
    messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n");
  return {
    ok: true,
    text,
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  };
}

function openaiEnv(): { baseUrl: string; apiKey: string } | null {
  const baseUrl =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1";
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function callOpenAI(args: AdapterArgs): Promise<AdapterResult> {
  const env = openaiEnv();
  if (!env) {
    return {
      ok: false,
      code: "provider_not_configured",
      message:
        "OpenAI is enabled in the registry but no API key is configured. Set AI_INTEGRATIONS_OPENAI_API_KEY (or OPENAI_API_KEY) and restart the server.",
    };
  }
  const body = {
    model: args.modelKey,
    stream: !!args.onDelta,
    messages: [
      { role: "system", content: args.systemPrompt },
      ...args.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };
  const r = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return {
      ok: false,
      code: "provider_error",
      message: `OpenAI ${r.status}: ${errText.slice(0, 240)}`,
    };
  }
  if (args.onDelta && r.body) {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          const delta = evt.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            text += delta;
            args.onDelta!(delta);
          }
          if (evt.usage) {
            inputTokens = evt.usage.prompt_tokens ?? inputTokens;
            outputTokens = evt.usage.completion_tokens ?? outputTokens;
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
    if (!inputTokens) inputTokens = Math.ceil(args.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    if (!outputTokens) outputTokens = Math.ceil(text.length / 4);
    return { ok: true, text, inputTokens, outputTokens };
  }
  const data = (await r.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    ok: true,
    text,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

function googleEnv(): { baseUrl: string; apiKey: string } | null {
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    process.env.GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";
  const apiKey =
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function callGoogle(args: AdapterArgs): Promise<AdapterResult> {
  const env = googleEnv();
  if (!env) {
    return {
      ok: false,
      code: "provider_not_configured",
      message:
        "Google is enabled in the registry but no API key is configured. Set AI_INTEGRATIONS_GEMINI_API_KEY (or GEMINI_API_KEY / GOOGLE_API_KEY) and restart the server.",
    };
  }
  const contents = args.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body = {
    systemInstruction: { parts: [{ text: args.systemPrompt }] },
    contents,
  };
  const action = args.onDelta ? "streamGenerateContent" : "generateContent";
  const url = `${env.baseUrl}/models/${encodeURIComponent(args.modelKey)}:${action}?key=${encodeURIComponent(env.apiKey)}${args.onDelta ? "&alt=sse" : ""}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return {
      ok: false,
      code: "provider_error",
      message: `Google ${r.status}: ${errText.slice(0, 240)}`,
    };
  }
  if (args.onDelta && r.body) {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload);
          const parts = evt.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) {
            if (typeof p.text === "string" && p.text) {
              text += p.text;
              args.onDelta!(p.text);
            }
          }
          if (evt.usageMetadata) {
            inputTokens = evt.usageMetadata.promptTokenCount ?? inputTokens;
            outputTokens = evt.usageMetadata.candidatesTokenCount ?? outputTokens;
          }
        } catch {
          // ignore
        }
      }
    }
    if (!inputTokens) inputTokens = Math.ceil(args.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    if (!outputTokens) outputTokens = Math.ceil(text.length / 4);
    return { ok: true, text, inputTokens, outputTokens };
  }
  const data = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  return {
    ok: true,
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function loadProjectAndOrg(
  projectId: number,
): Promise<{ project: Project; org: Organization | null } | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!project) return null;
  const org = await loadOrgForProject(project);
  return { project, org };
}

/** Test-connection ping for the admin UI. Validates we can reach a
 *  provider's API and parse a trivial response. */
export async function testProviderConnection(
  providerSlug: string,
  modelKey: string,
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const start = Date.now();
  try {
    const r = await callProviderAdapter({
      providerSlug,
      modelKey,
      systemPrompt: "You are a connection test. Reply with the single word OK.",
      messages: [{ role: "user", content: "Say OK." }],
    });
    if (!r.ok) {
      return { ok: false, latencyMs: Date.now() - start, message: r.message };
    }
    return {
      ok: true,
      latencyMs: Date.now() - start,
      message: `OK — model responded: ${r.text.slice(0, 80)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Date.now() - start, message };
  }
}
