import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  HostAdapter,
  HostCredentials,
  DeployTriggerInput,
  DeployTriggerResult,
  ParsedWebhookEvent,
  VerifyWebhookInput,
  WebhookEventKind,
} from "./types";

const VERCEL_API = "https://api.vercel.com";

interface VercelWebhookPayload {
  type?: string;
  payload?: {
    deployment?: {
      id?: string;
      url?: string;
      meta?: { githubCommitSha?: string; githubCommitRef?: string };
      target?: string | null;
    };
    project?: { id?: string };
    target?: string | null;
    url?: string;
  };
}

function eventKindFromType(type: string | undefined): WebhookEventKind {
  switch (type) {
    case "deployment.created":
      return "deployment.created";
    case "deployment.succeeded":
    case "deployment.ready":
      return "deployment.live";
    case "deployment.error":
      return "deployment.failed";
    case "deployment.canceled":
      return "deployment.canceled";
    default:
      return "unknown";
  }
}

function targetToEnv(target: string | null | undefined): "preview" | "staging" | "production" | null {
  if (target === "production") return "production";
  if (target === "preview") return "preview";
  if (target === "staging") return "staging";
  return null;
}

export const vercelAdapter: HostAdapter = {
  provider: "vercel",

  async triggerDeploy(
    input: DeployTriggerInput,
    creds: HostCredentials,
  ): Promise<DeployTriggerResult> {
    if (!creds.apiToken || !creds.projectId) {
      return {
        externalId: null,
        url: null,
        status: "failed",
        message: "Missing Vercel API token or projectId",
      };
    }
    // Vercel deploy hooks are typically the recommended way to trigger from
    // CI; the v13 deployments API requires repo upload. We POST to the
    // deploy hook if provided (creds.webhookSecret reused as hook URL is
    // discouraged); otherwise we fall back to creating a deployment by ref.
    try {
      const teamQs = creds.teamId ? `?teamId=${encodeURIComponent(creds.teamId)}` : "";
      const res = await fetch(`${VERCEL_API}/v13/deployments${teamQs}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: creds.projectId,
          project: creds.projectId,
          target: input.environment === "production" ? "production" : "preview",
          gitSource: {
            type: "github",
            ref: input.branch,
            sha: input.commitSha ?? undefined,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        url?: string;
        readyState?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          externalId: null,
          url: null,
          status: "failed",
          message: data.error?.message ?? `Vercel API ${res.status}`,
        };
      }
      return {
        externalId: data.id ?? null,
        url: data.url ? `https://${data.url}` : null,
        status: "queued",
      };
    } catch (err) {
      return {
        externalId: null,
        url: null,
        status: "failed",
        message: (err as Error).message,
      };
    }
  },

  async testConnection(creds: HostCredentials): Promise<{ ok: boolean; message: string }> {
    if (!creds.apiToken) return { ok: false, message: "Missing API token" };
    try {
      const teamQs = creds.teamId ? `?teamId=${encodeURIComponent(creds.teamId)}` : "";
      const res = await fetch(`${VERCEL_API}/v2/user${teamQs}`, {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
      });
      if (!res.ok) {
        return { ok: false, message: `Vercel API responded ${res.status}` };
      }
      const data = (await res.json()) as { user?: { username?: string; email?: string } };
      return {
        ok: true,
        message: `Connected as ${data.user?.username ?? data.user?.email ?? "Vercel user"}`,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },

  verifyWebhook({ rawBody, headers, projectSecret, fallbackSecret }: VerifyWebhookInput) {
    const sig = (headers["x-vercel-signature"] ?? "") as string;
    if (!sig) return { valid: false, reason: "missing signature" };
    const secret = projectSecret ?? fallbackSecret ?? "";
    if (!secret) return { valid: false, reason: "no webhook secret configured" };
    const expected = createHmac("sha1", secret).update(rawBody).digest("hex");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return { valid: false, reason: "signature length mismatch" };
    return { valid: timingSafeEqual(a, b) };
  },

  async getStatus(externalId: string, creds: HostCredentials) {
    if (!creds.apiToken) return { status: "unknown" as const, message: "Missing API token" };
    try {
      const teamQs = creds.teamId ? `?teamId=${encodeURIComponent(creds.teamId)}` : "";
      const res = await fetch(
        `${VERCEL_API}/v13/deployments/${encodeURIComponent(externalId)}${teamQs}`,
        { headers: { Authorization: `Bearer ${creds.apiToken}` } },
      );
      if (!res.ok) return { status: "unknown" as const, message: `Vercel API ${res.status}` };
      const data = (await res.json()) as { readyState?: string; url?: string };
      const map: Record<string, "queued" | "running" | "succeeded" | "failed"> = {
        QUEUED: "queued",
        INITIALIZING: "running",
        BUILDING: "running",
        DEPLOYING: "running",
        READY: "succeeded",
        ERROR: "failed",
        CANCELED: "failed",
      };
      return {
        status: map[data.readyState ?? ""] ?? ("unknown" as const),
        url: data.url ? `https://${data.url}` : null,
      };
    } catch (err) {
      return { status: "unknown" as const, message: (err as Error).message };
    }
  },

  async getLogs(externalId: string, creds: HostCredentials) {
    if (!creds.apiToken) return { ok: false, lines: [], message: "Missing API token" };
    try {
      const teamQs = creds.teamId ? `&teamId=${encodeURIComponent(creds.teamId)}` : "";
      const res = await fetch(
        `${VERCEL_API}/v2/deployments/${encodeURIComponent(externalId)}/events?limit=200${teamQs}`,
        { headers: { Authorization: `Bearer ${creds.apiToken}` } },
      );
      if (!res.ok) return { ok: false, lines: [], message: `Vercel API ${res.status}` };
      const data = (await res.json().catch(() => [])) as Array<{
        text?: string;
        payload?: { text?: string; info?: { type?: string } };
        type?: string;
        created?: number;
      }>;
      const lines = (Array.isArray(data) ? data : [])
        .map((e) => {
          const text = e.text ?? e.payload?.text ?? e.payload?.info?.type ?? e.type ?? "";
          const ts = e.created ? new Date(e.created).toISOString() : "";
          return text ? `${ts} ${text}`.trim() : "";
        })
        .filter(Boolean);
      return { ok: true, lines };
    } catch (err) {
      return { ok: false, lines: [], message: (err as Error).message };
    }
  },

  parseWebhookEvent(rawBody: Buffer): ParsedWebhookEvent {
    let payload: VercelWebhookPayload = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as VercelWebhookPayload;
    } catch {
      // payload stays empty
    }
    const dep = payload.payload?.deployment ?? {};
    const target = payload.payload?.target ?? dep.target ?? null;
    return {
      kind: eventKindFromType(payload.type),
      externalId: dep.id ?? null,
      hostingProjectId: payload.payload?.project?.id ?? null,
      url: dep.url ? `https://${dep.url}` : payload.payload?.url ?? null,
      commitSha: dep.meta?.githubCommitSha ?? null,
      branch: dep.meta?.githubCommitRef ?? null,
      environment: targetToEnv(target),
      errorMessage: null,
      raw: payload,
    };
  },
};
