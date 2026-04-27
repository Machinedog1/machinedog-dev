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
