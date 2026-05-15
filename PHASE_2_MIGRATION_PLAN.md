# Phase 2 migration plan

Phase 2 moves Machinedog.dev off the shared Replit container and onto a
production runtime that can support real multi-tenancy. None of this is in
the MVP. This document is the contract for what changes when we start the
migration.

## Goals

- Per-project workspace isolation (no shared filesystem / process space).
- Managed Postgres with backups, point-in-time recovery, and a real
  read-replica story.
- Secrets in a real secrets manager, not env vars.
- Object storage with per-tenant prefixes and lifecycle rules.
- Repo access via a real GitHub App, not a single PAT.
- A deployment runner that can promote a workspace build to a hosted target
  with rollback.

## Workstreams

### 1. Move runtime off Replit

- Replit stays for the *portal* (the React + Express front door). The
  *workspace runtime* (where user code actually runs) moves to Docker /
  Coder workspaces hosted on a Linux VM fleet (Hetzner / DigitalOcean /
  Fly.io for the Phase 2 cost target).
- Each project gets one workspace per environment (`dev`, `prod`).
- Idle workspaces suspend after a configurable timeout; resume restores from
  a snapshot.
- Per-workspace CPU + memory caps + network egress allow-list (no calls to
  arbitrary internet hosts unless the project owner allows it).

### 2. Managed Postgres

- Move from the bundled Replit Postgres to a managed provider (Neon /
  Supabase / RDS, depending on Phase 3 destination).
- Drizzle migrations stay the source of truth; CI runs `pnpm push` against
  the staging database before merge.
- Add a read-replica for analytics / admin queries.
- Daily backups + 30-day point-in-time recovery.

### 3. AWS Secrets Manager (or equivalent)

- All third-party credentials migrate from `.env` / Replit secrets into a
  managed secrets store, scoped by environment.
- Application secrets are fetched at boot via the SDK; rotation is
  automated for Stripe restricted keys, Clerk webhook secrets, and the
  GitHub App private key.
- Per-tenant secrets (project_secrets, deploy targets) move to the same
  store with a `org/<orgId>/project/<projectId>/` prefix; database only
  holds references, never plaintext.

### 4. S3 (or equivalent) for objects

- Replace the MVP object-storage shim with S3, scoped by `org/<orgId>/`
  prefix.
- KMS-encrypted at rest. Lifecycle rules: archive logs and old build
  artifacts to Glacier after 90 days.
- Pre-signed upload URLs continue to be the only path for the browser to
  upload directly.

### 5. Docker / Coder workspaces

- Each workspace is a long-running container (Coder) or an on-demand
  rootless Docker container.
- Workspace image baked from the project's stack (Node, Python, etc.),
  layered with the user's repo.
- Per-workspace deploy key for GitHub access (no shared PAT).
- Workspace logs streamed to the centralized log sink.

### 6. GitHub App

- Deprecate `GITHUB_TOKEN`. Stand up a Machinedog GitHub App with the
  minimum scopes needed (contents read/write, metadata read, webhooks).
- Per-tenant installations: each org installs the app on the GitHub
  organization(s) they want to expose.
- Webhooks (push, pull_request) trigger builds in the linked workspace.
- Short-lived installation tokens are minted server-side and never exposed
  to the browser.

### 7. Deployment runner

- A new `deployment_runner` service consumes the existing `deployments`
  table and promotes a workspace build to a configured target (Vercel,
  Render, Fly.io, or a managed Kubernetes cluster).
- Supports rollback to the previous live release (one of the in-flight
  project tasks; the data model already has the columns it needs).
- Build/start command overrides land in the same release (also an in-flight
  project task).

## Cutover plan

1. Stand up the new runtime in parallel — no traffic.
2. Migrate the Postgres database, dual-write for one week.
3. Move object storage to S3, dual-read for one week.
4. Move secrets to Secrets Manager, env vars become references.
5. Roll out the GitHub App: existing PAT-based projects continue to work
   until they reauthorize.
6. Migrate the first internal project to a Coder workspace; bake-off for
   one week.
7. Cut over external pilot orgs in waves.
8. Decommission the Replit-hosted runtime.

## Out of scope for Phase 2

- AWS HIPAA-eligible services (that is Phase 3).
- Multi-region active/active.
- A full CDN / WAF in front of the portal (Cloudflare / WAF is Phase 3).

## Risks

- **State sprawl during dual-write.** Mitigation: reconciliation job +
  hard cutover date, not an indefinite parallel run.
- **GitHub App rollout friction.** Mitigation: keep PAT path as a fallback
  for ~30 days post-cutover.
- **Workspace cold-start latency.** Mitigation: keep the warm pool sized
  to the active-org count + 20% headroom.
