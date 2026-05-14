import type {
  HostAdapter,
  HostCredentials,
  DeployTriggerInput,
  DeployTriggerResult,
  ParsedWebhookEvent,
  VerifyWebhookInput,
} from "./types";

/**
 * No-op Replit adapter — Replit deploys still flow through the existing
 * `/api/projects/prod-heartbeat` path; this adapter just lets the host
 * registry have a uniform shape and records that "deploys aren't
 * triggered from the portal for Replit."
 */
export const replitAdapter: HostAdapter = {
  provider: "replit",

  async triggerDeploy(_input: DeployTriggerInput, _creds: HostCredentials): Promise<DeployTriggerResult> {
    return {
      externalId: null,
      url: null,
      status: "failed",
      message:
        "Replit deploys are operator-driven (use the Replit Publish button). The portal records production via the prod-heartbeat token.",
    };
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: true,
      message: "Replit hosting uses the prod-heartbeat token; no API check necessary.",
    };
  },

  verifyWebhook(_input: VerifyWebhookInput) {
    return { valid: false, reason: "Replit hosting does not deliver host webhooks" };
  },

  async getStatus() {
    return { status: "unknown" as const, message: "Replit hosting status comes from prod-heartbeat, not this adapter." };
  },

  async getLogs() {
    return {
      ok: true,
      lines: [],
      message: "Replit deploys do not expose logs via this adapter; use the Replit console.",
    };
  },

  parseWebhookEvent(_rawBody: Buffer): ParsedWebhookEvent {
    return {
      kind: "unknown",
      externalId: null,
      hostingProjectId: null,
      url: null,
      commitSha: null,
      branch: null,
      environment: null,
      errorMessage: null,
      raw: null,
    };
  },
};
