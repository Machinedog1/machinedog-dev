# Roadmap

This roadmap is the visible plan for Machinedog.dev. It deliberately stops at
the boundary between what is shipped in the MVP and what is planned for
production hardening.

## Phase 0–9 — MVP (shipped)

The portal end-to-end loop:

- Phase 0 — Auth foundation. Hybrid sessions → Clerk cutover.
- Phase 1 — Plans, tokens, billing. Five subscription tiers, three token
  packs, append-only token ledger, Stripe webhooks, dev-mock fallback.
- Phase 2 — Multi-tenancy. `organizations` + `organization_members` tables,
  per-tenant scoping, audit log.
- Phase 3 — Projects, templates, GitHub import, change requests.
- Phase 4 — AI providers, models, usage accounting.
- Phase 5 — Build orders, build jobs, deployment surface (read-only).
- Phase 6 — Build minutes, audit timeline, admin platform pages.
- Phase 7 — Healthcare gating (BAA, HIPAA deployment status, MFA toggle).
- Phase 8 — Compliance review request flow, PHI gate, secrets/file scanning,
  operator notifications.
- Phase 9 — Onboarding wizard, public marketing pages, full documentation
  set, demo seed data.

## Phase 10 — Mobile / EAS (deferred)

Status: **deferred per user direction.** The Expo shell at
`artifacts/machinedog-mobile` boots and authenticates, but Phase 10 is not
part of the MVP demo. When picked up:

- EAS build pipeline (iOS + Android) wired to the workspace.
- Expo OTA updates gated per-org.
- Native auth via `expo-secure-store` (already wired) → token refresh.
- Push notifications for build / deployment events.
- Mobile-only views for the most common operator tasks.

## Phase 11 — Production runtime (planned)

Three deeply-coupled workstreams. None are in the MVP.

### 11a — Multi-turn agent loop

The MVP runs single-shot prompts. Phase 11a:

- Conversation memory with summarization and pinning.
- Tool-use loop (file edits, shell, browser, search) with per-tool tokens.
- Plan/act/critique cycle with cost caps per turn and per task.
- Streamed UI with cancel + branch.

### 11b — AWS HIPAA-ready environment

See [`AWS_HIPAA_PHASE_3_PLAN.md`](./AWS_HIPAA_PHASE_3_PLAN.md). Headlines:

- AWS account under signed BAA with HIPAA-eligible services only.
- ECS/EKS/Fargate runtime, RDS for Postgres, S3 for objects, KMS for
  per-tenant keys, Secrets Manager for credentials.
- CloudTrail + CloudWatch for audit, GuardDuty + WAF for posture, scheduled
  backups + audit exports.
- Healthcare-org gating with explicit PHI-mode approval before any PHI
  workload is allowed in.

### 11c — Coder / Docker workspaces

The MVP shares the Replit container. Phase 11c:

- One Coder/Docker workspace per project, with idle-suspend and resource
  caps.
- Per-workspace network egress allow-list.
- GitHub App (not PAT) for repo access; per-workspace deploy keys.
- Deployment runner that promotes a workspace build to a production host
  with rollback support.

## Out of scope (for now)

These have been considered and intentionally excluded from the visible plan:

- Self-serve enterprise SSO beyond Clerk's built-in providers.
- White-label tenants with full DNS / branding isolation.
- On-prem installation.

If you need any of these, talk to us.
