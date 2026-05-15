# Machinedog.dev

Machinedog.dev is an AI-native build portal: a private engineering workspace
where teams describe what they want, an AI agent drafts it, and the resulting
project lives inside a multi-tenant, billed, audited environment.

This repository is an MVP. It is the application surface — portal, API, mobile
shell, mockup sandbox — plus the docs that describe what the MVP does and does
not promise.

## Table of contents

- [What Machinedog.dev is](#what-machinedogdev-is)
- [Repository layout](#repository-layout)
- [Quick start (local)](#quick-start-local)
- [Running on Replit](#running-on-replit)
- [Environment variables](#environment-variables)
- [Third-party setup walkthroughs](#third-party-setup-walkthroughs)
  - [Clerk](#clerk)
  - [Stripe](#stripe)
  - [GitHub](#github)
  - [AI providers](#ai-providers)
- [MVP limitations](#mvp-limitations)
- [No-PHI-in-MVP notice](#no-phi-in-mvp-notice)
- [Further reading](#further-reading)

## What Machinedog.dev is

The portal lets a signed-in user:

- Create an organization and invite teammates.
- Pick a subscription plan (`starter`, `pro`, `business`, `healthcare`,
  `enterprise`) and top up token packs.
- Spin up projects from a blank workspace, a curated template, or a GitHub
  import.
- Run AI prompts charged against the org's token wallet.
- Commission consulting / build engagements via Stripe checkout.
- See per-org billing, audit, and compliance state.

The MVP is everything you need to demo the loop end-to-end. Production-grade
runtime (Coder/Docker workspaces, AWS HIPAA, multi-turn agent loops) is on the
roadmap — see [`ROADMAP.md`](./ROADMAP.md).

## Repository layout

This is a `pnpm` workspace monorepo.

```
artifacts/
  api-server/         Express 5 API + Stripe + Clerk webhooks
  machinedog-portal/  React + Vite portal (sign-in, dashboard, billing, …)
  machinedog-mobile/  Expo mobile shell
  mockup-sandbox/     Standalone mockup canvas
lib/
  db/                 Drizzle ORM schema + migrations
  api-spec/           OpenAPI source of truth
  api-zod/            Generated Zod schemas
  api-client-react/   Generated TanStack Query hooks
  ui/                 Shared UI primitives (shadcn-style)
scripts/              One-off TypeScript scripts
docs/                 Operational docs (Stripe setup, Phase 0 follow-ups, …)
```

## Quick start (local)

Prerequisites: Node 24, pnpm 9+, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env
# Fill in DATABASE_URL plus the integrations you want to exercise
pnpm --filter @workspace/db push        # apply Drizzle schema
pnpm --filter @workspace/api-server dev # API on :8080
pnpm --filter @workspace/machinedog-portal dev # Portal on :5173
```

The portal will boot in **demo mode** if Clerk env vars are missing — a banner
explains how to enable real auth. Stripe similarly falls back to a `dev_mock`
flow that grants tokens immediately so you can exercise billing without a
Stripe account.

## Running on Replit

This project is built to run on Replit's pnpm workspace template. Each
artifact is registered with the platform and the preview pane lets you switch
between portal, mobile, API, and the mockup canvas via the dropdown.

- Workflows are auto-managed when you create or edit an artifact — do not edit
  `artifact.toml` or `.replit` by hand.
- Environment variables and secrets live in the Replit secrets pane. Use the
  agent's environment-secrets skill rather than committing them to `.env`.
- The `[postMerge]` hook re-runs `scripts/post-merge.sh` after a task merges
  to keep the database schema in sync.

## Environment variables

A complete annotated template lives in [`.env.example`](./.env.example).
Variables are grouped by:

- **Database** — `DATABASE_URL` (required).
- **Clerk** — auth + org webhooks (required for non-demo).
- **Stripe** — plans, packs, retainer, build deposit, webhook secret.
- **AI** — provider keys for the integrations proxy.
- **GitHub** — personal access token for repo import (optional in MVP).
- **App** — `PUBLIC_APP_URL`, `OPERATOR_EMAIL`, `LEADS_NOTIFY_EMAIL`.
- **AWS (Phase 3)** — placeholders only; not used in the MVP.

The portal's Vite build only sees variables prefixed with `VITE_` — keep
secrets server-side.

## Third-party setup walkthroughs

### Clerk

1. Create a Clerk application (test mode is fine for MVP).
2. Set `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`. Mirror the publishable
   key into `VITE_CLERK_PUBLISHABLE_KEY` so the portal mounts `<ClerkProvider>`.
3. In Clerk → Webhooks, add an endpoint at
   `${PUBLIC_APP_URL}/api/clerk/webhook` and subscribe to the
   `organization.*` and `organizationMembership.*` events. Copy the signing
   secret into `CLERK_WEBHOOK_SECRET`.
4. The api-server's `routes/clerk-webhook.ts` will create matching
   `organizations` + `organization_members` rows on every event.

### Stripe

See [`docs/setup-stripe.md`](./docs/setup-stripe.md) for the full walkthrough.
Short version:

1. Create products + recurring prices for the five plans (monthly + annual)
   and one-off prices for the three token packs.
2. Drop the price IDs into the `STRIPE_PRICE_PLAN_*` and `STRIPE_PRICE_PACK_*`
   env vars.
3. Add a webhook at `${PUBLIC_APP_URL}/api/stripe/webhook` listening to
   `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`,
   `invoice.payment_failed`. Copy the secret into `STRIPE_WEBHOOK_SECRET`.
4. Without `STRIPE_SECRET_KEY` the portal uses the dev-mock flow.

### GitHub

The MVP supports public-repo cloning into a project via a personal access
token. The recommended Phase 2 path is a real GitHub App — see
[`PHASE_2_MIGRATION_PLAN.md`](./PHASE_2_MIGRATION_PLAN.md) and
[`SECURITY_NOTES.md`](./SECURITY_NOTES.md).

### AI providers

The repo wires through Replit's AI Integrations proxy. Set whichever provider
keys you want exposed (`AI_INTEGRATIONS_ANTHROPIC_API_KEY`, etc.). When PHI is
in scope the provider must have an active BAA — see
[`HIPAA_NOTES.md`](./HIPAA_NOTES.md).

## MVP limitations

- **Single-tenant runtime.** Workspaces today execute in the shared Replit
  container — there is no per-org isolation boundary yet.
- **No multi-turn agent loop.** The console runs single-shot prompts.
- **No production deployment runner.** Publish flows mint a heartbeat token
  and the project owner is responsible for the runtime host.
- **Phase 10 (mobile / EAS).** Deferred per user direction. The Expo shell
  exists but is not part of the MVP demo path.

## No-PHI-in-MVP notice

**Do not load real Protected Health Information into the MVP.** The MVP is
intended for demos and pilots only. There is no signed BAA from Replit, no
HIPAA-eligible runtime, and no audit-export workflow. The healthcare tier
exists in the UI to show the planned product surface — see
[`HIPAA_NOTES.md`](./HIPAA_NOTES.md) for what we will and will not promise to
prospective healthcare customers.

## Further reading

- [`ROADMAP.md`](./ROADMAP.md) — phase-by-phase plan.
- [`SECURITY_NOTES.md`](./SECURITY_NOTES.md) — tenant isolation, secrets,
  audit, GitHub App.
- [`HIPAA_NOTES.md`](./HIPAA_NOTES.md) — healthcare scope and BAA posture.
- [`PHASE_2_MIGRATION_PLAN.md`](./PHASE_2_MIGRATION_PLAN.md) — moving runtime
  off Replit, managed Postgres, Docker workspaces.
- [`AWS_HIPAA_PHASE_3_PLAN.md`](./AWS_HIPAA_PHASE_3_PLAN.md) — AWS HIPAA-ready
  environment.
- [`docs/setup-stripe.md`](./docs/setup-stripe.md) — Stripe price + webhook
  setup.
- [`docs/phase-0-followups.md`](./docs/phase-0-followups.md) — open items from
  the auth cutover.
