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

const RENDER_API = "https://api.render.com/v1";

interface RenderWebhookPayload {
  type?: string;
  service?: { id?: string };
  data?: {
    deploy?: {
      id?: string;
      status?: string;
      commit?: { id?: string; message?: string };
    };
  };
}

function eventKindFromType(type: string | undefined): WebhookEventKind {
  switch (type) {
    case "deploy.created":
      return "deployment.created";
    case "deploy.live":
    case "deploy.succeeded":
      return "deployment.live";
    case "deploy.failed":
    case "deploy.build_failed":
      return "deployment.failed";
    case "deploy.canceled":
      return "deployment.canceled";
    default:
      return "unknown";
  }
}

export const renderAdapter: HostAdapter = {
  provider: "render",

  async triggerDeploy(
    input: DeployTriggerInput,
    creds: HostCredentials,
  ): Promise<DeployTriggerResult> {
    if (!creds.apiToken || !creds.projectId) {
      return {
        externalId: null,
        url: null,
        status: "failed",
        message: "Missing Render API token or service id",
      };
    }
    try {
      const res = await fetch(
        `${RENDER_API}/services/${encodeURIComponent(creds.projectId)}/deploys`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.apiToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            commitId: input.commitSha ?? undefined,
            clearCache: "do_not_clear",
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        status?: string;
        message?: string;
      };
      if (!res.ok) {
        return {
          externalId: null,
          url: null,
          status: "failed",
          message: data.message ?? `Render API ${res.status}`,
        };
      }
      return {
        externalId: data.id ?? null,
        url: null,
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
      const res = await fetch(`${RENDER_API}/owners?limit=1`, {
        headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: "application/json" },
      });
      if (!res.ok) return { ok: false, message: `Render API responded ${res.status}` };
      return { ok: true, message: "Connected to Render" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },

  verifyWebhook({ rawBody, headers, projectSecret, fallbackSecret }: VerifyWebhookInput) {
    const sig = ((headers["render-signature"] ?? headers["x-render-signature"]) ?? "") as string;
    if (!sig) return { valid: false, reason: "missing signature" };
    const secret = projectSecret ?? fallbackSecret ?? "";
    if (!secret) return { valid: false, reason: "no webhook secret configured" };
    // Render signs with HMAC-SHA256, header value is "v1=<hex>" or just hex
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = sig.includes("=") ? sig.split("=").pop()! : sig;
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return { valid: false, reason: "signature length mismatch" };
    return { valid: timingSafeEqual(a, b) };
  },

  async getStatus(externalId: string, creds: HostCredentials) {
    if (!creds.apiToken || !creds.projectId) {
      return { status: "unknown" as const, message: "Missing Render API token or service id" };
    }
    try {
      const res = await fetch(
        `${RENDER_API}/services/${encodeURIComponent(creds.projectId)}/deploys/${encodeURIComponent(externalId)}`,
        { headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: "application/json" } },
      );
      if (!res.ok) return { status: "unknown" as const, message: `Render API ${res.status}` };
      const data = (await res.json()) as { status?: string };
      const map: Record<string, "queued" | "running" | "succeeded" | "failed"> = {
        created: "queued",
        build_in_progress: "running",
        update_in_progress: "running",
        live: "succeeded",
        deactivated: "failed",
        build_failed: "failed",
        update_failed: "failed",
        canceled: "failed",
      };
      return { status: map[data.status ?? ""] ?? ("unknown" as const) };
    } catch (err) {
      return { status: "unknown" as const, message: (err as Error).message };
    }
  },

  async getLogs(externalId: string, creds: HostCredentials) {
    if (!creds.apiToken || !creds.projectId) {
      return { ok: false, lines: [], message: "Missing Render API token or service id" };
    }
    try {
      const res = await fetch(
        `${RENDER_API}/services/${encodeURIComponent(creds.projectId)}/deploys/${encodeURIComponent(externalId)}`,
        { headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: "application/json" } },
      );
      if (!res.ok) return { ok: false, lines: [], message: `Render API ${res.status}` };
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        commit?: { message?: string };
        finishedAt?: string;
        createdAt?: string;
      };
      const lines = [
        data.createdAt ? `${data.createdAt} deploy created` : "",
        data.commit?.message ? `commit: ${data.commit.message}` : "",
        data.status ? `status: ${data.status}` : "",
        data.finishedAt ? `${data.finishedAt} deploy finished` : "",
      ].filter(Boolean);
      return { ok: true, lines };
    } catch (err) {
      return { ok: false, lines: [], message: (err as Error).message };
    }
  },

  parseWebhookEvent(rawBody: Buffer): ParsedWebhookEvent {
    let payload: RenderWebhookPayload = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as RenderWebhookPayload;
    } catch {
      // ignore
    }
    const deploy = payload.data?.deploy ?? {};
    return {
      kind: eventKindFromType(payload.type),
      externalId: deploy.id ?? null,
      hostingProjectId: payload.service?.id ?? null,
      url: null,
      commitSha: deploy.commit?.id ?? null,
      branch: null,
      environment: "production",
      errorMessage: null,
      raw: payload,
    };
  },
};
