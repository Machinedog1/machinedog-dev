# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Operator notifications (pricing-page leads)

- `LEADS_NOTIFY_EMAIL` — operator inbox that receives new pricing-page leads. If unset, falls back to `SMTP_FROM_EMAIL` / `SMTP_FROM` / `SMTP_USER`.
- Email delivery uses SMTP via nodemailer. Configure with:
  - `SMTP_HOST` (e.g. `smtp.office365.com`)
  - `SMTP_PORT` (defaults to 587)
  - `SMTP_USER` — login username
  - `SMTP_PASSWORD` (alias accepted: `SMTP_PASS`)
  - `SMTP_FROM` — sender address (alias accepted: `SMTP_FROM_EMAIL`); falls back to `SMTP_USER`
  - `SMTP_SECURE` (optional: `true`/`false`; defaults to `true` for port 465, `false` otherwise)
- If SMTP is unavailable or the send fails, the lead is still saved to the `leads` table and the failure reason is recorded in `notify_error`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
