import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import { SubmitLeadBody, SubmitLeadResponse } from "@workspace/api-zod";
import { loadMailerConfig, getTransporter } from "../lib/mailer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Very small in-memory rate limiter. Good enough as a first-pass spam guard
// for a low-volume contact form on a single instance.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (ipHits.size > 5000) {
    for (const [key, hits] of ipHits) {
      const fresh = hits.filter((t) => t > cutoff);
      if (fresh.length === 0) ipHits.delete(key);
      else ipHits.set(key, fresh);
    }
  }

  return false;
}

function clientIp(req: import("express").Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0];
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = SubmitLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Honeypot: real users never fill the hidden `website` field. If it has any
  // value we silently succeed so bots can't tell the form rejected them.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    req.log.warn({ ip: clientIp(req) }, "lead honeypot triggered");
    res.json(SubmitLeadResponse.parse({ success: true }));
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many submissions. Please try again later." });
    return;
  }

  const userAgent = req.headers["user-agent"];
  const source = parsed.data.source?.trim() || "pricing-page";

  const [inserted] = await db
    .insert(leadsTable)
    .values({
      name: parsed.data.name.trim(),
      email: parsed.data.email.trim().toLowerCase(),
      company: parsed.data.company?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      source,
      ipAddress: ip,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 500) : null,
    })
    .returning({ id: leadsTable.id });

  // Send the operator notification email. A delivery failure must not fail
  // the request — the lead is already persisted and the operator can see it
  // in the database.
  void notifyOperator(inserted.id, parsed.data, source).catch((err) => {
    logger.error({ err, leadId: inserted.id }, "Failed to send lead notification email");
  });

  res.json(SubmitLeadResponse.parse({ success: true, id: inserted.id }));
});

interface LeadPayload {
  name: string;
  email: string;
  company?: string | null;
  notes?: string | null;
}

async function notifyOperator(
  leadId: number,
  lead: LeadPayload,
  source: string,
): Promise<void> {
  // Operator inbox: prefer LEADS_NOTIFY_EMAIL, then SMTP_FROM_EMAIL/SMTP_FROM,
  // then SMTP_USER. This way the form works as soon as SMTP is configured even
  // if no separate notification address is set.
  const operatorEmail =
    process.env.LEADS_NOTIFY_EMAIL?.trim() ||
    process.env.SMTP_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim();
  if (!operatorEmail) {
    logger.warn(
      { leadId },
      "No operator email configured — set LEADS_NOTIFY_EMAIL (or SMTP_FROM/SMTP_USER)",
    );
    await db
      .update(leadsTable)
      .set({ notifyError: "operator_email_not_configured" })
      .where(eq(leadsTable.id, leadId));
    return;
  }

  const cfg = loadMailerConfig();
  if (!cfg) {
    logger.warn(
      { leadId },
      "SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM",
    );
    await db
      .update(leadsTable)
      .set({ notifyError: "smtp_not_configured" })
      .where(eq(leadsTable.id, leadId));
    return;
  }

  const subject = `[Machinedog] New lead from ${lead.name}${lead.company ? ` · ${lead.company}` : ""}`;
  const company = lead.company?.trim() || "—";
  const notes = lead.notes?.trim() || "(no message)";

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; color: #0b1220;">
      <h2 style="margin:0 0 12px;">New lead from ${escapeHtml(source)}</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td><strong>${escapeHtml(lead.name)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td><a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Company</td><td>${escapeHtml(company)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Lead ID</td><td>#${leadId}</td></tr>
      </table>
      <h3 style="margin:20px 0 6px;">Message</h3>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#f6f8fb;padding:12px;border-radius:8px;">${escapeHtml(notes)}</pre>
    </div>
  `.trim();

  const text = [
    `New lead from ${source}`,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Company: ${company}`,
    `Lead ID: #${leadId}`,
    ``,
    `Message:`,
    notes,
  ].join("\n");

  try {
    const transporter = getTransporter(cfg);
    await transporter.sendMail({
      from: cfg.from,
      to: operatorEmail,
      replyTo: lead.email,
      subject,
      html,
      text,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, leadId }, "SMTP send failed for lead notification");
    await db
      .update(leadsTable)
      .set({ notifyError: `smtp_error: ${msg}`.slice(0, 500) })
      .where(eq(leadsTable.id, leadId));
    return;
  }

  await db
    .update(leadsTable)
    .set({ notifiedAt: new Date(), notifyError: null })
    .where(eq(leadsTable.id, leadId));
}

export default router;
