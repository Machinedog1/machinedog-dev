/**
 * Machinedog heartbeat snippet.
 *
 * Drop into your Replit-hosted app (Node/Bun, ESM or CJS) and import on boot:
 *
 *   import "./machinedog-heartbeat.js";   // ESM
 *   require("./machinedog-heartbeat.js"); // CJS
 *
 * Then set MACHINEDOG_TOKEN in your Replit Secrets to the value Machinedog
 * shows you on the project page. The snippet POSTs your current
 * `https://${REPLIT_DEV_DOMAIN}` (Replit assigns this per-run) to Machinedog
 * once on startup, so the Dev preview pane on machinedog.dev always points at
 * your live workspace.
 *
 * No external dependencies. Safe to ship to production — the snippet is a
 * no-op when MACHINEDOG_TOKEN is unset (i.e. in deployed environments).
 */
(function machinedogHeartbeat() {
  const token = process.env.MACHINEDOG_TOKEN;
  if (!token) return;

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (!devDomain) return; // not running on Replit dev

  const endpoint =
    process.env.MACHINEDOG_HEARTBEAT_URL ||
    "https://machinedog.dev/api/projects/heartbeat";

  const body = JSON.stringify({
    token,
    devUrl: `https://${devDomain}`,
    replId: process.env.REPL_ID || null,
    replSlug: process.env.REPL_SLUG || null,
  });

  // fetch is global on Node 18+; if not, fall back silently.
  const f = typeof fetch === "function" ? fetch : null;
  if (!f) return;

  f(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
    .then(function (r) {
      if (r && r.ok) {
        console.log("[machinedog] dev URL reported");
      } else if (r) {
        console.warn("[machinedog] heartbeat failed:", r.status);
      }
    })
    .catch(function (err) {
      console.warn("[machinedog] heartbeat error:", err && err.message);
    });
})();
