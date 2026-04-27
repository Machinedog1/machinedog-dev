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

## Per-project client invites

- Schema: `projects` carries `summary`, `liveUrl`, `coverImageUrl` plus the existing fields. Membership lives in `project_members` (`projectId`, `email`, `clientId?`, `role`, `status: pending|active|removed`, `invitedByClientId`, `invitedAt`, `acceptedAt`).
- API: `GET /api/projects` returns owned + shared projects with a synthesized `viewerRole` (`"owner"` or `"collaborator"`). `GET /api/projects/:id` allows owner or any active member. `PATCH /api/projects/:id` is owner-only.
- Members API (owner-only): `GET /api/projects/:id/members`, `POST /api/projects/:id/members` (body `{ email }`), `DELETE /api/projects/:id/members/:memberId` (soft-removes by setting status to `removed`).
- Invite flow: `POST .../members` lowercases email, upserts a `project_members` row, sends an invite email via `lib/project-invites.ts` (uses the shared SMTP mailer + `PUBLIC_APP_URL` / `REPLIT_DEV_DOMAIN`), and stubs an `invited` client placeholder if no account exists yet.
- Activation rule: a membership is only auto-marked `active` if a matching client row already has `status === "active"`. Anything else (no client, `invited` placeholder, `suspended`) stays `pending` until that user actually signs in.
- `loadOrCreateClient` in `api-server/src/lib/auth.ts` calls `attachPendingProjectMemberships(clientId, email)` whenever an active client is loaded or freshly created — this promotes any pending memberships matching the user's email to `active` and stamps `acceptedAt`. First-time signers with no admin-side client invite but a pending project membership are auto-activated as a regular `active` client (zero token balance).
- Frontend: `/projects` lists owned + shared with a "Shared with me" badge; cards link to `/projects/:id` (registered in `App.tsx`). `/projects/:id` shows cover image / summary / live URL, an owner-only edit form (title, summary, liveUrl, coverImageUrl, description, status), and an owner-only collaborators panel for invite + remove. Sidebar (`AppLayout.tsx`) now has a prominent "Buy tokens" CTA next to the token bar.
- Pricing page has a "Portal Access — $500/mo" section above the retainer block. The "START PORTAL ACCESS" CTA calls `POST /api/checkout/portal` (Stripe subscription mode, `kind=portal` metadata, default $500/mo, override with `STRIPE_PORTAL_USD` or `STRIPE_PRICE_PORTAL`); when the user is not signed in it redirects to `/sign-in?redirect_url=/pricing#portal-access`. When the client already has `portalSubscriptionStatus` of `active`/`trialing`, the button becomes "OPEN YOUR PORTAL" linking to `/projects`.

## Per-project collaboration (comments + prompts + files)

- Schema: `project_comments` (id, projectId, clientId, body, createdAt), `project_files` (id, projectId, uploadedByClientId, name, contentType, sizeBytes, objectPath, createdAt). `prompt_sessions.projectId` is a nullable FK so prompts can optionally be scoped to a project.
- API (gated by `getViewableProject`, i.e. project owner or any active member):
  - Comments: `GET/POST /api/projects/:id/comments`, `DELETE /api/projects/:id/comments/:commentId` (author or owner only).
  - Project prompts: `GET /api/projects/:id/prompts`, `POST /api/projects/:id/prompts` — same Claude flow as the global console; tokens are charged to whoever runs it; the resulting `prompt_sessions` row carries `projectId` so it shows up for everyone in the project.
  - Files: `GET/POST /api/projects/:id/files`, `DELETE /api/projects/:id/files/:fileId` (uploader or owner only). `objectPath` must start with `/objects/`.
- Object storage: `artifacts/api-server/src/lib/{objectStorage,objectAcl}.ts` plus `routes/storage.ts` expose `POST /api/storage/uploads/request-url` returning `{ uploadURL, objectPath }`. The frontend uses a hidden `<input type=file>` + plain `fetch(uploadURL, { method: "PUT" })` (no Uppy) and then registers the file via `POST /api/projects/:id/files`.
- Frontend: `/projects/:id` now renders `ProjectPromptPanel`, `ProjectCommentsPanel`, and `ProjectFilesPanel` below the project header (in that order). Owner can delete any comment/file; members can delete only their own.
- Single-project auto-redirect: `AuthGuard` in `App.tsx` calls `useListMyProjects` when a non-admin lands on `/`; if the list contains exactly one project and the viewer's role is `collaborator`, it redirects to `/projects/:id`. Owners and multi-project members keep their normal landing page.

## Portal Access subscription (Stripe)

- New columns on `clients`: `stripeCustomerId`, `portalSubscriptionId`, `portalSubscriptionStatus` (`trialing|active|past_due|canceled|incomplete|null`), `portalCurrentPeriodEnd`.
- `POST /api/checkout/portal` (auth'd) creates a Stripe Checkout session with `mode=subscription`, `metadata.kind=portal`, and `metadata.clientId`. Defaults to $500/mo; configurable via `STRIPE_PORTAL_USD` or `STRIPE_PRICE_PORTAL`.
- `stripe-webhook.ts` handles both `checkout.session.completed` (kind=portal) and `customer.subscription.{created,updated,deleted}` (kind=portal in subscription metadata) — syncing `stripeCustomerId`, `portalSubscriptionId`, `portalSubscriptionStatus`, and `portalCurrentPeriodEnd`.

## Public Stripe Checkout (pricing page)

- `START YOUR BUILD` and `INCLUDE RETAINER` on `/pricing` create public Stripe Checkout sessions via `POST /api/checkout/build` and `POST /api/checkout/retainer`. No auth required — anonymous visitors can pay.
- Build is a one-time payment (defaults to **$25,000**, override with `STRIPE_BUILD_DEPOSIT_USD`). Retainer is a monthly subscription (defaults to **$1,200/mo**, override with `STRIPE_RETAINER_USD`).
- Optionally pass an existing Stripe Price ID via `STRIPE_PRICE_BUILD` / `STRIPE_PRICE_RETAINER` instead of inline `price_data`.
- Successful checkout redirects to `/thank-you?kind=build|retainer&session_id=...`. The `checkout.session.completed` webhook records the order in the `build_orders` table (kind, email, name, Stripe IDs, status).
- If `STRIPE_SECRET_KEY` is not set, both endpoints return HTTP 503 and the UI shows a friendly fallback to the contact form.

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

## Mobile responsive system (`@workspace/machinedog-mobile`)

- `hooks/useResponsive.ts` is the source of truth. Breakpoints: compact <360, regular 360–719, medium 720–1023 (covers iPad Mini portrait at 744), expanded ≥1024.
- `useResponsive()` returns `{width, height, isCompact, isRegular, isTablet, containerMaxWidth, gutter, gap, columns, scale(), font(compact, regular, tablet?), pick({compact, regular, tablet, default})}`.
- `components/ScreenShell.tsx` centers content with `containerMaxWidth` (720 medium / 880 expanded), composes safe-area top + bottom inset, and applies responsive `gutter`/`gap`. `Backdrop` uses `useWindowDimensions` so it reacts to viewport / orientation changes.
- Bundle and consulting package cards switch to a 2-column grid on tablet (`flexBasis: "48%"` + `maxWidth: "48%"`, `columnGap`/`rowGap: 12`). Pass `noMargin` to `BundleCard` (or omit `packageCard` style) to avoid double vertical spacing inside the grid.
- Sign-in hero clamps to 58% of viewport height on phones (340–500) and 50% on tablets (340–620). Headline tracks the website's `clamp(1.5rem, 7vw, 4.5rem)` rule: phones get `clamp(22, width*0.07, 30)`, tablets get `clamp(40, width*0.07, 64)`. Letter-spacing on the headline is `-0.6` (anything tighter pushes "INTELLIGENCE" past the card edge on a 393-wide phone).
- Sign-in mirrors the portal's mobile composition: brand row → husky hero (frontal portrait `husky-portrait-frontal.png` with `objectPosition: 50% 30%`, web-only `filter: saturate(1.18) contrast(1.06) brightness(0.82)`, radial cyan halo with `mixBlendMode: screen` over the eyes, lower-2/3 dark fade) → headline glass card → form glass card → footer caption. Use explicit `width/height: 100%` + `objectFit: cover` on the `<Image>` rather than `StyleSheet.absoluteFill`, otherwise React Native Web does not propagate `object-fit/object-position` correctly and the image renders mis-cropped.

## Authentication (custom email + password, no Clerk)

Clerk is fully removed. Auth is roll-your-own across the API, web portal, and mobile app.

- **Schema**: `clients.passwordHash` (argon2), `clients.passwordSetAt`. New tables: `auth_sessions` (`id`, `clientId`, `tokenHash`, `expiresAt`, `createdAt`, `lastUsedAt`), `auth_invites` (`tokenHash`, `email`, `clientId`, `expiresAt`, `usedAt`), `password_reset_tokens` (`tokenHash`, `clientId`, `expiresAt`, `usedAt`). All tokens are stored hashed; the raw token is only emailed once.
- **Sessions**: opaque hex token (`crypto.randomBytes(32)`). Web sets `md_session` http-only cookie via `Set-Cookie` (SameSite=Lax, Secure). Mobile receives `sessionToken` in the JSON body of sign-in / accept-invite / reset-password and stores it in `expo-secure-store` (key `md_session_token`). Mobile attaches `Authorization: Bearer <token>`; web relies on cookies (`credentials: "include"`).
- **API endpoints** (`artifacts/api-server/src/routes/auth.ts`):
  - `POST /api/auth/sign-in` — email + password → `{ client, sessionToken }` + cookie.
  - `POST /api/auth/sign-out` — invalidates the current session.
  - `GET  /api/auth/me` — returns the signed-in client.
  - `POST /api/auth/accept-invite` — body `{ token, password }`. Sets password, marks invite used, mints session.
  - `POST /api/auth/forgot-password` — body `{ email }`. Always returns 200; if the client exists, emails a reset link.
  - `POST /api/auth/reset-password` — body `{ token, password }`. Sets new password, deletes ALL prior sessions, mints a fresh one.
  - `POST /api/auth/change-password` — auth-required; verifies `currentPassword`, sets new, revokes other sessions, mints fresh.
- **Guard middleware**: `lib/auth.ts` exposes `req.dbClient` (named `dbClient` to avoid colliding with Node's built-in `req.client` socket — do NOT rename). `requireAuth` returns 401 when no session; `requireAdmin` returns 403 unless `isAdmin`.
- **Email**: `lib/auth-emails.ts` sends invite + reset emails via the shared SMTP mailer. Links use `PUBLIC_APP_URL` (or `REPLIT_DEV_DOMAIN`) → `/accept-invite?token=...` (7d TTL) and `/reset-password?token=...` (1h TTL).
- **Web portal** (`artifacts/machinedog-portal`): `src/lib/auth.tsx` provides `<AuthProvider>` + `useAuth()` (calls `GET /api/auth/me` with `credentials: "include"`). `App.tsx` wraps `<AuthProvider>` and switches between `PublicOnlyRoutes` (`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/accept-invite`, plus marketing pages) and `AuthedRoutes`. `sign-up.tsx` is now an invite-only notice. `settings.tsx` has a custom change-password form + sign-out. `AppLayout.tsx` shows initial-letter avatar + LogOut button.
- **Mobile** (`artifacts/machinedog-mobile`): `lib/auth.tsx` stores the token in `expo-secure-store` and registers a Bearer-header getter via `setAuthTokenGetter` (called from `api-client-react`). `app/_layout.tsx` wraps `<AuthProvider>` (no Clerk). `(tabs)/_layout.tsx` redirects to `/(auth)/sign-in` when `!isSignedIn`. `(auth)/sign-in.tsx` uses `useAuth().signIn`; `(auth)/sign-up.tsx` is the activate-invite screen (invite token + password). `(tabs)/profile.tsx` uses `useAuth().signOut` and shows email-derived display name.
- **Bootstrap**: existing client rows have no `passwordHash`. Use `/forgot-password` to send a reset link, or have an admin issue an invite. Admin user `tom@machinedog.com` (id=2) must use `/forgot-password` first to set a password.
- **Env vars removed**: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_PROXY_URL` — none of these are referenced anywhere now (build script + dev script were both cleaned up).
