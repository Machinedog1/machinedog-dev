# Security notes

This document records the security posture of the MVP and the gaps we
explicitly carry into Phase 2 / Phase 3. It is written to be honest about
what is in place today, not to oversell.

## Tenant isolation

**Today (MVP).** Tenant isolation is *logical*, not *physical*:

- Every dependent table (projects, prompts, change requests, token ledger,
  audit events, builds, deployments, secrets) carries an `organization_id`
  column.
- The Clerk middleware (`artifacts/api-server/src/lib/clerk.ts`) resolves the
  active organization from the session and pins it onto `req.organization`.
- Route guards (`requireAuth`, `requireOrganization`, `requireAdmin`) refuse
  to serve cross-org rows; queries always filter by `req.organization.id`.
- Tenant resolution helpers live in `lib/db/src/tenant.ts` and are the
  recommended path for any new query.

What is *not* in place yet:

- No row-level security in Postgres. A bug in a route handler that forgets
  the org filter would leak data; we mitigate with code review and the
  centralized helpers.
- No per-tenant database, schema, or KMS key.
- Workspaces (the place where AI-generated code actually runs) share the
  Replit container in the MVP — they are not isolated VMs / containers.

The Phase 2 plan (see [`PHASE_2_MIGRATION_PLAN.md`](./PHASE_2_MIGRATION_PLAN.md))
moves to per-workspace Docker / Coder containers with network egress
allow-lists. The Phase 3 plan layers per-tenant KMS keys on top.

## Secrets handling

- Project-level secrets live in `project_secrets` and are encrypted at rest
  via Postgres' `pgcrypto`-style encryption helpers in `lib/db`. The plaintext
  never leaves the api-server boundary.
- Application secrets (Clerk, Stripe, AI provider keys) live in environment
  variables, sourced from Replit secrets in production. They are never logged
  — `pino-http` is configured to redact request bodies.
- The PHI gate in Phase 8 actively scans uploaded files and project secrets
  for HIPAA-relevant patterns and blocks the run if the org has not been
  approved for PHI workloads.
- We do **not** store payment credentials. Stripe is the system of record;
  the api-server only persists the Stripe customer / subscription IDs.

## Audit logs

- Every billing event, plan change, BAA / HIPAA deployment status change,
  invite, suspension, compliance review, PHI block, and admin action writes
  to the `audit_events` table via `lib/audit.ts`.
- The `/admin/audit` page exposes the full timeline with org / actor / kind
  filters.
- Audit events are append-only at the application level. There is no
  database-level enforcement yet — Phase 3 moves to an immutable audit sink
  (CloudTrail + S3 with object lock, plus a per-tenant export).
- Per-tenant audit export (CSV / JSON) is on the Phase 3 backlog.

## Authentication

- Clerk owns sign-in, sign-up, password reset, MFA, and organization
  management. The api-server validates session tokens via `@clerk/express`
  and never sees user passwords.
- Webhooks (`routes/clerk-webhook.ts`) keep the local `organizations` and
  `organization_members` tables in sync with Clerk on `organization.*` and
  `organizationMembership.*` events.
- Admin status is conferred via the `ADMIN_EMAILS` env var on first login;
  `member.role = "admin" | "owner"` thereafter. Healthcare orgs can opt
  organization-wide into MFA via `organizations.mfa_required` (the toggle
  is in the admin UI; full enforcement lands with the Phase 8 healthcare
  gating).

## GitHub access

- The MVP supports public-repo cloning via a personal access token
  (`GITHUB_TOKEN`). This is intentionally minimal — the token has no per-org
  scoping and cannot install webhooks.
- **The recommended production path is a real GitHub App** with per-tenant
  installations:
  - Per-org install gives us org-scoped repo access, deploy keys, and
    webhooks.
  - Short-lived installation tokens minted server-side, never sent to the
    browser.
  - Webhooks for push events that auto-trigger builds for the linked
    project.
- The Phase 2 migration plan tracks this work explicitly. Until then, treat
  the GitHub integration as a developer convenience, not a production path.

## Workspace isolation roadmap

The MVP runs prompts and (eventually) build steps inside the shared Replit
container. This is acceptable for a demo / pilot, **not** for production
multi-tenancy.

Roadmap, in order:

1. **Phase 2** — One Docker/Coder workspace per project, idle-suspend, CPU
   + memory caps, network egress allow-list, per-workspace deploy key.
2. **Phase 3** — Move the orchestration to AWS ECS/Fargate (or EKS) under a
   signed BAA. Per-workspace KMS keys, VPC isolation, CloudWatch logging,
   GuardDuty for posture, WAF in front of the portal.
3. **Phase 3+** — PHI-mode approval flow before any healthcare workload is
   admitted to the runtime. Audit + backup retention to match BAA terms.

Until Phase 2 lands, customers should treat the workspace as a shared
sandbox: do not check in real production secrets, do not load PHI, and do
not assume the workspace will outlive a Replit container restart.

## Reporting a vulnerability

Email `security@machinedog.dev`. We will acknowledge within two business days.
This will move to a published `SECURITY.txt` + bounty program once we are out
of MVP.
