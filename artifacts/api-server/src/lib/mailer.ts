import nodemailer, { type Transporter } from "nodemailer";

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
