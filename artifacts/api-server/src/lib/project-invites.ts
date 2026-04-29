import { loadMailerConfig, getTransporter } from "./mailer";
import { logger } from "./logger";

interface SendProjectInviteEmailArgs {
  to: string;
  projectTitle: string;
  invitedByEmail: string;
  alreadyHasAccount: boolean;
  /**
   * Single-use token that lets the recipient land on /accept-invite and set
   * their password. Required when the account is not yet active.
   */
  inviteToken?: string | null;
}

function getPortalUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "https://machinedog.dev";
}

export async function sendProjectInviteEmail(
  args: SendProjectInviteEmailArgs,
): Promise<void> {
  const cfg = loadMailerConfig();
  if (!cfg) {
    logger.warn("Skipping project invite email — SMTP not configured");
    return;
  }
  const portal = getPortalUrl();
  // Active accounts go straight to /projects. Anyone else (new email,
  // suspended, or invited-but-not-yet-activated) needs the accept-invite
  // flow with a token so they can set a password and have any pending
  // project memberships auto-attached on first login.
  const ctaUrl = args.alreadyHasAccount
    ? `${portal}/projects`
    : args.inviteToken
    ? `${portal}/accept-invite?token=${encodeURIComponent(args.inviteToken)}`
    : `${portal}/sign-up`;
  const ctaLabel = args.alreadyHasAccount
    ? "Open Machinedog.Dev"
    : args.inviteToken
    ? "Accept invite & set password"
    : "Create your account";

  const subject = `${args.invitedByEmail} invited you to ${args.projectTitle} on Machinedog.Dev`;

  const text = [
    `${args.invitedByEmail} invited you to collaborate on "${args.projectTitle}" on Machinedog.Dev.`,
    "",
    args.alreadyHasAccount
      ? `Sign in to view the project: ${ctaUrl}`
      : args.inviteToken
      ? `Accept your invite and set a password (${args.to}): ${ctaUrl}\n\nThe project will be waiting for you in your projects list as soon as you sign in. The link expires in 7 days.`
      : `Use this email (${args.to}) to request access: ${ctaUrl}`,
    "",
    "— The Machinedog team",
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070914;color:#e6e9f2;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#0e1224;border:1px solid rgba(63,177,240,0.2);border-radius:16px;padding:32px">
        <h1 style="font-size:20px;margin:0 0 16px;color:#3FB1F0;letter-spacing:0.04em;text-transform:uppercase">Machinedog.Dev</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px">
          <strong>${escapeHtml(args.invitedByEmail)}</strong> invited you to collaborate on
          <strong>${escapeHtml(args.projectTitle)}</strong>.
        </p>
        <p style="font-size:14px;line-height:1.5;color:#a4adc7;margin:0 0 24px">
          ${
            args.alreadyHasAccount
              ? "Sign in with your existing account to open the project."
              : args.inviteToken
              ? `Click below to set a password for <strong>${escapeHtml(args.to)}</strong>. The project will be waiting in your projects list as soon as you sign in. The link expires in 7 days.`
              : `Create your account with <strong>${escapeHtml(args.to)}</strong> to accept the invitation. We'll attach you to the project automatically.`
          }
        </p>
        <p style="margin:0 0 24px">
          <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(120deg,#3FB1F0,#7c5cff);color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px">
            ${ctaLabel}
          </a>
        </p>
        <p style="font-size:12px;color:#6b7494;margin:0">
          If the button doesn't work, copy this link into your browser:<br/>
          <span style="word-break:break-all">${ctaUrl}</span>
        </p>
      </div>
    </div>
  `;

  const transporter = getTransporter(cfg);
  await transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject,
    text,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
