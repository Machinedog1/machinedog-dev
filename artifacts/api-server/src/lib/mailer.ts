import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";
import type { Logger } from "pino";

export interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

export function loadMailerConfig(): MailerConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const portStr = process.env.SMTP_PORT?.trim() || "587";
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port)) {
    return null;
  }

  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure =
    secureRaw === "true" || secureRaw === "1"
      ? true
      : secureRaw === "false" || secureRaw === "0"
        ? false
        : port === 465;

  const user = process.env.SMTP_USER?.trim() || undefined;
  const password =
    process.env.SMTP_PASSWORD || process.env.SMTP_PASS || undefined;

  // Accept SMTP_FROM (canonical) or SMTP_FROM_EMAIL (alias). Falls back to user.
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_FROM_EMAIL?.trim() ||
    user;
  if (!from) return null;

  return { host, port, secure, user, password, from };
}

let cachedTransporter: Transporter | null = null;
let cachedKey: string | null = null;

function configKey(cfg: MailerConfig): string {
  return [cfg.host, cfg.port, cfg.secure, cfg.user ?? "", cfg.from].join("|");
}

export function getTransporter(cfg: MailerConfig): Transporter {
  const key = configKey(cfg);
  if (cachedTransporter && cachedKey === key) {
    return cachedTransporter;
  }
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth:
      cfg.user && cfg.password
        ? { user: cfg.user, pass: cfg.password }
        : undefined,
  });
  cachedKey = key;
  return cachedTransporter;
}

function getPortalUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "https://machinedog.dev";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SendInviteEmailArgs {
  to: string;
  token: string;
  invitedByEmail?: string;
  log?: Logger;
}

export async function sendInviteEmail(args: SendInviteEmailArgs): Promise<void> {
  const portal = getPortalUrl();
  const url = `${portal}/accept-invite?token=${encodeURIComponent(args.token)}`;
  const subject = "You're invited to Machinedog.Dev";

  const text = [
    args.invitedByEmail
      ? `${args.invitedByEmail} invited you to join Machinedog.Dev — a private AI engineering atelier.`
      : `You've been invited to join Machinedog.Dev — a private AI engineering atelier.`,
    "",
    `Set your password to activate your account:`,
    url,
    "",
    "This invite link expires in 7 days.",
    "",
    "— The Machinedog team",
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070914;color:#e6e9f2;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#0e1224;border:1px solid rgba(63,177,240,0.2);border-radius:16px;padding:32px">
        <h1 style="font-size:20px;margin:0 0 16px;color:#3FB1F0;letter-spacing:0.04em;text-transform:uppercase">Machinedog.Dev</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px">
          ${args.invitedByEmail ? `<strong>${escapeHtml(args.invitedByEmail)}</strong> invited you to ` : "You've been invited to "}
          join <strong>Machinedog.Dev</strong> — a private AI engineering atelier.
        </p>
        <p style="font-size:14px;line-height:1.5;color:#a4adc7;margin:0 0 24px">
          Set your password to activate your account. This link expires in 7 days.
        </p>
        <p style="margin:0 0 24px">
          <a href="${url}" style="display:inline-block;background:linear-gradient(120deg,#3FB1F0,#7c5cff);color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px">
            Set your password
          </a>
        </p>
        <p style="font-size:12px;color:#6b7494;margin:0">
          If the button doesn't work, copy this link into your browser:<br/>
          <span style="word-break:break-all">${url}</span>
        </p>
      </div>
    </div>`;

  await sendOrLog({ to: args.to, subject, text, html, url, log: args.log, kind: "invite" });
}

interface SendResetEmailArgs {
  to: string;
  token: string;
  log?: Logger;
}

export async function sendPasswordResetEmail(args: SendResetEmailArgs): Promise<void> {
  const portal = getPortalUrl();
  const url = `${portal}/reset-password?token=${encodeURIComponent(args.token)}`;
  const subject = "Reset your Machinedog.Dev password";

  const text = [
    "Someone (hopefully you) requested a password reset for your Machinedog.Dev account.",
    "",
    "Reset your password with this link (expires in 1 hour):",
    url,
    "",
    "If you didn't request this, you can safely ignore this email.",
    "",
    "— The Machinedog team",
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070914;color:#e6e9f2;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#0e1224;border:1px solid rgba(63,177,240,0.2);border-radius:16px;padding:32px">
        <h1 style="font-size:20px;margin:0 0 16px;color:#3FB1F0;letter-spacing:0.04em;text-transform:uppercase">Machinedog.Dev</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px">Reset your password</p>
        <p style="font-size:14px;line-height:1.5;color:#a4adc7;margin:0 0 24px">
          Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <p style="margin:0 0 24px">
          <a href="${url}" style="display:inline-block;background:linear-gradient(120deg,#3FB1F0,#7c5cff);color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px">
            Reset password
          </a>
        </p>
        <p style="font-size:12px;color:#6b7494;margin:0">
          If you didn't request this, ignore this email. If the button doesn't work, copy this link:<br/>
          <span style="word-break:break-all">${url}</span>
        </p>
      </div>
    </div>`;

  await sendOrLog({ to: args.to, subject, text, html, url, log: args.log, kind: "reset" });
}

interface SendChangeRequestPublishEmailArgs {
  to: string;
  projectTitle: string;
  changeRequestTitle: string;
  changeRequestUrl: string;
  prUrl: string | null;
  productionUrl: string | null;
  requesterEmail: string | null;
  log?: Logger;
}

export async function sendChangeRequestPublishEmail(
  args: SendChangeRequestPublishEmailArgs,
): Promise<void> {
  const subject = `[Machinedog] Publish requested: ${args.projectTitle} — ${args.changeRequestTitle}`;

  const lines = [
    args.requesterEmail
      ? `${args.requesterEmail} approved a change in "${args.projectTitle}" and clicked Publish.`
      : `A client approved a change in "${args.projectTitle}" and clicked Publish.`,
    "",
    `Change request: ${args.changeRequestTitle}`,
    `Open in Machinedog: ${args.changeRequestUrl}`,
  ];
  if (args.prUrl) lines.push(`Merged PR: ${args.prUrl}`);
  if (args.productionUrl) lines.push(`Production URL: ${args.productionUrl}`);
  lines.push(
    "",
    "Action required: open the project in Replit and click Publish to deploy main.",
    "When the new version is live, mark the change as Deployed inside Machinedog.",
    "",
    "— Machinedog",
  );
  const text = lines.join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070914;color:#e6e9f2;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#0e1224;border:1px solid rgba(63,177,240,0.2);border-radius:16px;padding:32px">
        <h1 style="font-size:20px;margin:0 0 16px;color:#3FB1F0;letter-spacing:0.04em;text-transform:uppercase">Machinedog.Dev</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 12px">
          ${args.requesterEmail ? `<strong>${escapeHtml(args.requesterEmail)}</strong>` : "A client"}
          approved a change in <strong>${escapeHtml(args.projectTitle)}</strong> and clicked Publish.
        </p>
        <p style="font-size:14px;line-height:1.5;color:#a4adc7;margin:0 0 16px">
          <strong>Change request:</strong> ${escapeHtml(args.changeRequestTitle)}
        </p>
        <p style="margin:0 0 16px">
          <a href="${args.changeRequestUrl}" style="display:inline-block;background:linear-gradient(120deg,#3FB1F0,#7c5cff);color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px">
            Open change request
          </a>
        </p>
        ${args.prUrl ? `<p style="font-size:13px;color:#a4adc7;margin:0 0 8px"><strong>Merged PR:</strong> <a href="${args.prUrl}" style="color:#3FB1F0">${escapeHtml(args.prUrl)}</a></p>` : ""}
        ${args.productionUrl ? `<p style="font-size:13px;color:#a4adc7;margin:0 0 16px"><strong>Production:</strong> <a href="${args.productionUrl}" style="color:#3FB1F0">${escapeHtml(args.productionUrl)}</a></p>` : ""}
        <p style="font-size:13px;line-height:1.5;color:#e6e9f2;margin:16px 0 0;padding:12px 16px;background:rgba(124,92,255,0.12);border:1px solid rgba(124,92,255,0.3);border-radius:8px">
          Action required: open the project in Replit and click <strong>Publish</strong> to deploy main, then mark the change as <strong>Deployed</strong> in Machinedog.
        </p>
      </div>
    </div>
  `;

  await sendOrLog({
    to: args.to,
    subject,
    text,
    html,
    url: args.changeRequestUrl,
    log: args.log,
    kind: "publish-request",
  });
}

async function sendOrLog(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  url: string;
  log?: Logger;
  kind: "invite" | "reset" | "publish-request";
}): Promise<void> {
  const log = args.log ?? logger;
  const cfg = loadMailerConfig();
  if (!cfg) {
    log.warn(
      { to: args.to, url: args.url, kind: args.kind },
      `SMTP not configured — printing ${args.kind} link to logs (set SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM to enable email)`,
    );
    return;
  }
  try {
    const transporter = getTransporter(cfg);
    await transporter.sendMail({
      from: cfg.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    log.info({ to: args.to, kind: args.kind }, "Sent transactional email");
  } catch (err) {
    log.error({ err, to: args.to, url: args.url, kind: args.kind }, "Failed to send email — link printed to logs as fallback");
  }
}
