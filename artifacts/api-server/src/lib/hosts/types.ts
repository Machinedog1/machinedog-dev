/**
 * Host adapter contract — every concrete provider (Vercel, Render,
 * Replit no-op) implements this so the publish/build/deploy paths and
 * webhooks stay provider-agnostic.
 */

export type HostProvider = "replit" | "vercel" | "render";

export interface HostCredentials {
  /** API token / bearer used to call the provider's API. */
  apiToken?: string;
  /** Webhook signing secret used to verify inbound webhook payloads. */
  webhookSecret?: string;
  /** Provider-specific project / service id. */
  projectId?: string;
  /** Optional team / workspace id for providers that scope by team. */
  teamId?: string;
}

export interface DeployTriggerInput {
  projectId: number;
  organizationId: number;
  branch: string;
  commitSha?: string | null;
  environment: "preview" | "staging" | "production";
  changeRequestId?: number | null;
  triggeredBy?: string | null;
  triggeredByEmail?: string | null;
}

export interface DeployTriggerResult {
  externalId: string | null;
  url: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  message?: string;
}

export type WebhookEventKind =
  | "build.started"
  | "build.succeeded"
  | "build.failed"
  | "deployment.created"
  | "deployment.live"
  | "deployment.failed"
  | "deployment.canceled"
  | "unknown";

export interface ParsedWebhookEvent {
  kind: WebhookEventKind;
  externalId: string | null;
  /** Where to apply this update — provider-supplied project id. */
  hostingProjectId: string | null;
  url: string | null;
  commitSha: string | null;
  branch: string | null;
  environment: "preview" | "staging" | "production" | null;
  errorMessage: string | null;
  raw: unknown;
}

export interface VerifyWebhookInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  /** Optional fallback secret pulled from process.env, used when no
   * project-scoped secret is configured (mostly the Replit case). */
  fallbackSecret?: string | null;
  /** Per-project secret resolved by the route layer. */
  projectSecret?: string | null;
}

export interface HostAdapter {
  provider: HostProvider;
  /** Trigger a deploy for the given project + commit. */
  triggerDeploy(input: DeployTriggerInput, creds: HostCredentials): Promise<DeployTriggerResult>;
  /**
   * Fetch current status for an external deployment id. Used as a polling
   * fallback when webhooks are missed. Returns the same status vocabulary
   * as triggerDeploy plus an optional url/message.
   */
  getStatus(
    externalId: string,
    creds: HostCredentials,
  ): Promise<{ status: "queued" | "running" | "succeeded" | "failed" | "unknown"; url?: string | null; message?: string }>;
  /** Quick sanity check used by the settings UI's "test connection" button. */
  testConnection(creds: HostCredentials): Promise<{ ok: boolean; message: string }>;
  /** Verify the inbound webhook signature. Returns true on valid signature. */
  verifyWebhook(input: VerifyWebhookInput): { valid: boolean; reason?: string };
  /** Parse a raw webhook payload into our normalized shape. */
  parseWebhookEvent(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhookEvent;
  /**
   * Fetch logs from the host for the given external deployment id. Used by
   * the SSE log stream so the publish pane can surface real build output, not
   * just status transitions. Adapters return an array of plain text lines and
   * are expected to be cheap to call repeatedly (poll-friendly). Returning
   * an empty array means "no new logs available" — the stream filters dupes
   * upstream by lineCount.
   */
  getLogs?(externalId: string, creds: HostCredentials): Promise<{ ok: boolean; lines: string[]; message?: string }>;
}
