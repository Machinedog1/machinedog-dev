# Workspace

## Overview

This project is a pnpm workspace monorepo utilizing TypeScript, designed for building scalable applications. Its primary purpose is to provide a robust platform for managing projects, facilitating collaboration, and integrating with external services like Stripe for payments. Key capabilities include per-project client invites, real-time collaboration features (comments, prompts, file sharing), and a custom authentication system. The project aims to offer a comprehensive solution for project management with a focus on user experience and efficient development workflows.

## User Preferences

I prefer iterative development with clear, concise communication. Please ask before making major architectural changes or introducing new dependencies. I value detailed explanations for complex features.

## System Architecture

The project is built as a pnpm workspace monorepo using Node.js 24 and TypeScript 5.9. The API layer is powered by Express 5, interacting with a PostgreSQL database via Drizzle ORM. Zod is used for schema validation. API code generation is handled by Orval from an OpenAPI specification, and `esbuild` is used for CJS bundling.

**UI/UX Decisions:**
The UI features a mobile-responsive design using a custom responsive hook and `ScreenShell` component. Breakpoints are defined for compact (<360px), regular (360-719px), medium (720-1023px), and expanded (≥1024px) views, providing adaptive layouts and typography. Components like `BundleCard` and `ScreenShell` are designed for flexible content display across devices. Sign-in screens are carefully composed with brand elements, imagery, and glass card aesthetics for a modern look.

**Technical Implementations:**
- **Project Management:** Features include project creation, ownership, and collaboration. Projects have `summary`, `liveUrl`, `coverImageUrl`, and `status`. Access is controlled by `project_members` with roles (`owner`, `collaborator`) and statuses (`pending`, `active`, `removed`).
- **Collaboration Features:**
    - **Comments:** `project_comments` table stores comments linked to projects and clients. API endpoints allow for fetching, posting, and deleting comments.
    - **Prompts:** `prompt_sessions` can be optionally scoped to a `projectId`, enabling shared prompt history within a project.
    - **Files:** `project_files` stores metadata for files uploaded to projects, managed via an object storage solution.
- **Authentication:** Currently a hybrid — legacy `argon2` cookie sessions (the original implementation, still primary) running in parallel with a Phase 0 Clerk integration that activates only when `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` are set. A demo banner is shown when Clerk is disabled. See `docs/phase-0-followups.md` for the planned cutover.
- **Plans, tokens, billing (Phase 1):** Five subscription tiers (`starter`, `pro`, `business`, `healthcare`, `enterprise`) and three token packs (`small`, `medium`, `large`) defined in `artifacts/api-server/src/lib/plans.ts` with env-driven Stripe price IDs (`STRIPE_PRICE_PLAN_*`, `STRIPE_PRICE_PACK_*`). Org subscription state lives in the new `subscriptions` table and is mirrored onto `organizations.planType` / `planStatus`. Token balances use an append-only `token_ledger` (idempotent on `stripeEventId`) with row-locked atomic deduction in `lib/token-service.ts`; the legacy `clients.tokenBalance` column is the running total updated under the same `FOR UPDATE` lock. All billing-related state changes also write to the `audit_events` table via `lib/audit.ts`. Stripe webhook handles `checkout.session.completed` (plan + pack), `customer.subscription.*`, `invoice.paid` (renewal grants), and `invoice.payment_failed` (audit). When `STRIPE_SECRET_KEY` is unset, billing falls back to a `dev_mock` flow that grants tokens immediately so local dev works with zero Stripe config — see `docs/setup-stripe.md`. Portal exposes `/billing` (plan card, change-plan with monthly/annual toggle, invoices, demo banner) and revamped `/tokens` (balance, three packs, usage by category, recent ledger).
- **Multi-tenancy (Phase 0 foundation):** New `organizations` + `organization_members` tables sit alongside the legacy `clients` table. Every existing client is mirrored 1:1 into an organization (see `scripts/src/backfill-organizations.ts`). Dependent tables (projects, change_requests, project_members, prompt_sessions, token_purchases) have a nullable `organization_id` column populated by the backfill. New code should prefer `organization_id`; legacy code keeps using `client_id` until the cutover migration. Tenant resolution helpers live in `lib/db/src/tenant.ts`; the parallel-auth middleware lives in `artifacts/api-server/src/lib/clerk.ts`.
- **Auto-Heartbeat:** Projects include a `heartbeat_token` to allow client applications to report their `liveUrl` dynamically. A public API endpoint `POST /api/projects/heartbeat` updates the project's `liveUrl` and `heartbeat_at` timestamp.
- **Stripe Integration:** Manages subscriptions for "Portal Access" and one-time payments/subscriptions for "Build" and "Retainer" offerings. Webhooks handle `checkout.session.completed` and `customer.subscription` events to sync client and subscription statuses.

**Feature Specifications:**
- **Client Invites:** Owners can invite collaborators via email. Invitations create pending memberships that become active upon the user's first sign-in.
- **Token System:** Tokens are charged for prompt execution. The system handles activation of pending memberships for first-time signers.
- **Object Storage:** Utilizes a custom object storage solution with `POST /api/storage/uploads/request-url` for secure pre-signed URLs, facilitating direct file uploads from the frontend.

## External Dependencies

- **pnpm:** Monorepo management
- **Node.js:** Runtime environment
- **TypeScript:** Programming language
- **Express 5:** API framework
- **PostgreSQL:** Database
- **Drizzle ORM:** Object-Relational Mapper
- **Zod:** Schema validation library
- **Orval:** OpenAPI client code generator
- **esbuild:** JavaScript bundler
- **Stripe:** Payment processing for subscriptions and one-time payments
- **Nodemailer:** Email sending via SMTP
- **expo-secure-store:** Secure storage for mobile application tokens