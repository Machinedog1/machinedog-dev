# Phase 0 — Follow-up Migration TODOs

Phase 0 was intentionally landed as a non-breaking **foundation slice**. The
new `organizations` + `organization_members` tables exist alongside the legacy
`clients` table; Clerk middleware runs alongside the legacy cookie session;
nullable `organization_id` columns sit alongside their `client_id` siblings.

The legacy paths must be deleted in subsequent migrations. This document
tracks the work that was deferred.

## 1. Schema rename and FK cutover

Replace `clients` with `organizations` everywhere. Concretely:

- Drop `legacy_client_id` from `organizations` and `organization_members`
  once nothing reads it.
- For every dependent table:
  - `projects.client_id` → drop, keep `organization_id NOT NULL`
  - `change_requests.requester_client_id` → drop or rename to a generic
    `requester_member_id` pointing at `organization_members.id`
  - `project_members.client_id` → drop, keep `organization_id NOT NULL`
  - `prompt_sessions.client_id` → drop
  - `token_purchases.client_id` → drop
  - `sessions.client_id` → drop together with the legacy auth path
- After all FK references are gone, drop the `clients` table.

Sequencing — every dependent table must be migrated to read from
`organization_id` BEFORE the column drop. Use a transactional migration with
a deploy-time guard that asserts `organization_id IS NOT NULL` for every
row first.

## 2. Auth cutover to Clerk only

- Delete `lib/sessions.ts`, the `sessions` table, and the `md_session`
  cookie path.
- Delete the `password_hash`, `invite_token`, `password_reset_token`,
  `invite_token_expires_at`, `password_reset_expires_at` columns from
  `clients` (or skip if dropping the table entirely).
- Delete `loadSessionAndClient`, `requireAuth`, `requireActiveClient` and
  the bridge in `loadClerkAndOrganization` that falls back to
  `req.dbClient`.
- Replace every route's `requireAuth` with the Clerk-only equivalent
  (`requireOrganization` plus a new `requireRole` that reads
  `req.organizationMember.role`).
- Move `requireAdmin` from a global `clients.isAdmin` flag to a per-org
  role check (`role === 'admin'` on the active membership).
- Remove the demo banner, `isClerkEnabled` fallback, and the
  `try { import("@clerk/express") }` lazy load — make it a hard requirement.

## 3. User migration to Clerk identities

- For each existing client, send a Clerk invite (or magic link) and capture
  the resulting `user_xxx` id back into `organization_members.clerk_user_id`.
- Verify Tom (`tom@machinedog.com`) ends up with `role = 'admin'` on the
  Machinedog admin org.
- Verify the Ctrl.farm primary contact ends up with `role = 'owner'` on the
  Ctrl.farm org with all change requests still visible.
- Backfill historical `change_request_events.actor_client_id` to a new
  `actor_member_id` column.

## 4. Server-side tenancy enforcement

Every existing route currently filters by `client_id`. Audit each one and
swap to `organization_id` from `req.organization`:

- `routes/projects.ts` (list, create, get, update, members, comments,
  prompts, files, heartbeat-token rotate, prod-heartbeat)
- `routes/change-requests.ts` (entire flow)
- `routes/prompts.ts`
- `routes/tokens.ts` (token balance moves to `organizations.token_balance`)
- `routes/admin.ts` (admin lookups by email/client → by org)
- `routes/checkout.ts` (Stripe customer mapping)
- `routes/clients.ts` → rename to `routes/organizations.ts`

## 5. Token balance + plan placeholders

`organizations` has placeholder `plan_type`, `plan_status`, `baa_status`.
Phase 1 fills these in:

- Move `clients.token_balance`, `total_tokens_used` to `organizations`.
- Move `clients.stripe_customer_id` to `organizations` (already mirrored on
  backfill — switch reads when the column drop happens).
- Move `portal_subscription_id`, `portal_subscription_status`,
  `portal_current_period_end` likewise.

## 6. Webhook handling

Add `POST /api/clerk/webhook` that:

- On `organization.created` — upsert `organizations` row.
- On `organizationMembership.created` — upsert `organization_members` row.
- On `user.created` / `user.updated` — sync email + clerkUserId.
- On `organization.deleted` — soft-delete the org.

## 7. CI

The `.github/workflows/ci.yml` has not been added yet (the foundation slice
focused on backup-only). Add a workflow on `pull_request` that runs
`pnpm install` + `pnpm run typecheck` + unit tests, plus branch protection
on `main` requiring it to pass.
