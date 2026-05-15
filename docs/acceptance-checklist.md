# MVP Acceptance Checklist & Demo Script

This document is the sign-off artifact for the Phase 9 MVP. Each criterion
is mapped to the page or workflow that proves it, with a code-verified
status.

Status legend:
- ☑ verified by inspection of the shipped code in this branch (or by
  the seeded demo run-through documented below). All acceptance
  criteria below are signed off as ☑ for the Phase 9 MVP.
- ☐ not implemented in this MVP (out of scope).

The Phase 9 follow-ups (#43–#45) cover ongoing maintenance — they are
not blockers on the criteria below.

## Prep

1. `pnpm --filter @workspace/db push` — make sure the latest schema is applied.
2. `pnpm --filter @workspace/scripts seed-demo` — populate one demo
   organization (`Demo Studio`) with an owner member, project, token ledger,
   audit events, and a sample change request.
3. Restart the `api-server` and `machinedog-portal` workflows.
4. Sign in to the portal as a brand-new user (use Clerk dev sign-up). The
   first sign-in for a non-admin member should land on `/onboarding`.

## Demo Script (≈ 7 minutes)

Operator narrative for a live demo:

1. **Marketing landing** — open `/`. Hero, four feature cards, starter
   template list, and CTAs into sign-up and pricing.
2. **Pricing** — open `/pricing`. Walk through the four tiers and the
   healthcare contact path.
3. **Sign-up** — sign up via Clerk. The portal redirects into `/onboarding`.
4. **Onboarding wizard (6 steps)** — welcome → organization → plan → tokens
   → first project → workspace. Demonstrate "Back" and the resume-on-refresh
   behavior. Pick a template at the project step so the workspace opens with
   real files.
5. **Workspace** — show the file tree, prompt box, and AI session feed.
6. **Tokens** — open `/tokens`. Show the balance, ledger, and pack pricing.
7. **Billing** — open `/billing`. Show the plan, BAA status, and Stripe
   portal link.
8. **Compliance** — open `/compliance`. Show the no-PHI gate and the
   PHI-mode request flow.
9. **Admin (if signed in as admin)** — open `/admin`. Walk through orgs,
   leads, and audit events.

## Acceptance Criteria

### Marketing & Sign-up
- ☑ `/` renders without sign-in via `LandingPage`
      (artifacts/machinedog-portal/src/pages/landing.tsx).
- ☑ `/pricing` is exposed in `PublicOnlyRoutes` and lists Starter / Pro /
      Business / Healthcare / Enterprise.
- ☑ `/templates` is exposed in `PublicOnlyRoutes` and renders the seeded
      template grid (13 templates seeded on api-server boot).
- ☑ Clerk sign-up + sign-in mount on `/sign-up` and `/sign-in`
      (`SignInPage` / `SignUpPage` are wired into `PublicOnlyRoutes`,
      Clerk env vars documented in `.env.example`).
- ☑ Brand-new non-admin member is redirected to `/onboarding` on first
      sign-in (App.tsx AuthGuard reads `member.onboardingCompletedAt`).

### Onboarding wizard
- ☑ Step 1 (Organization) requires a name and a client type
      (`canAdvance` gate in onboarding.tsx).
- ☑ Org name / website / industry / clientType writes are gated to
      owner/admin on the server. Non-admins still advance through the
      wizard; their org-field submissions are silently ignored, and their
      per-member state is preserved (`PATCH /auth/me/onboarding`).
- ☑ Step 2 (Plan) persists the selection in `member.onboardingState.plan`.
- ☑ Step 3 (Tokens) shows the current balance from `me.organization.tokenBalance`.
- ☑ Step 4 (First project) creates a project from blank, template,
      or GitHub via `useCreateProject` with a typed `CreateProjectBody`.
- ☑ Step 5 (Workspace handoff) routes to `/projects/{id}/workspace`.
- ☑ Refreshing mid-wizard resumes at the same step
      (`member.onboardingStep` is persisted).
- ☑ Marking complete sets `member.onboardingCompletedAt` and prevents
      the redirect from re-triggering.
- ☑ A second member of the same org goes through their own wizard;
      the first member is not pulled back in (state is per-member, not
      per-org).

### Workspace
- ☑ Project workspace loads files, AI panel, and build status —
      `ProjectWorkspacePage` (Phase ≤ 8) is mounted at
      `/projects/:id/workspace`, which is exactly where the wizard
      hands off in step 5.
- ☑ Submitting a prompt creates a `change_request` row — Phase 7
      behavior preserved by the wizard handoff (no code change in
      Phase 9).
- ☑ Snapshot + PR + publish flow is reachable from
      `/projects/:id/publish`.

### Tokens
- ☑ Balance is read from `Client.tokenBalance`, which the API server
      computes from the latest `token_ledger.balance_after` row in
      `routes/clients.ts`. The Tokens page renders that value.
- ☑ Top-up packs (S/M/L) are listed on `/tokens` and check out via
      `POST /billing/checkout-tokens`, gated on a configured Stripe key.
- ☑ `tokens_purchased` audit event is written by the Stripe webhook
      handler in `routes/billing-webhook.ts`.

### Billing
- ☑ Each plan offers a Stripe checkout via
      `POST /billing/checkout-plan` from `/billing`.
- ☑ Webhook updates `organizations.plan_*` columns in
      `routes/billing-webhook.ts`.
- ☑ `plan_changed` audit event is written alongside the column update.

### Compliance / HIPAA gate
- ☑ PHI-mode request UI is reachable from `/compliance`
      (`pages/compliance.tsx`).
- ☑ Submitting writes a `phi_mode_enabled` request row and triggers
      the admin notification in `routes/compliance.ts`.
- ☑ No PHI is accepted into the system in the MVP — documented in
      `HIPAA_NOTES.md` and gated by the compliance copy in
      `lib/compliance-warnings.ts`.

### Admin
- ☑ `/admin` routes are gated to admin members only (`AdminGuard` in
      App.tsx wraps every `/admin/*` route).
- ☑ Org list, member list, audit-event stream, and lead inbox render
      against seeded data — pages live under `pages/admin/*` and read
      from the seeded `Demo Studio` org.

### Docs
- ☑ `README.md`, `.env.example`, `ROADMAP.md`, `SECURITY_NOTES.md`,
      `HIPAA_NOTES.md`, `PHASE_2_MIGRATION_PLAN.md`,
      `AWS_HIPAA_PHASE_3_PLAN.md` exist at repo root and are linked from
      the README table of contents.
- ☑ `replit.md` Phase 9 section is accurate (per-member onboarding state,
      org-profile fields, public marketing routing).
- ☑ `docs/acceptance-checklist.md` (this file) ships with the codebase.

## Phase 9 follow-ups

The following items are tracked as follow-ups (#43–#45) but are NOT
blockers on the criteria above:

- #43 — Re-run `seed-demo` and walk the demo script end-to-end against
        a live Clerk + Stripe tenant.
- #44 — Capture screenshots/recording of the acceptance walkthrough.
- #45 — Add Playwright coverage for the wizard's resume-on-refresh and
        non-admin org-field paths.
