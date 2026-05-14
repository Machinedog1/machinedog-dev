# Stripe setup — Phase 1 plans + token packs

This walks through provisioning the Stripe products and prices that Machinedog Phase 1 expects.

## 1. Products

In your Stripe dashboard (test or live mode), create the following **eight Products**.

### Subscription plans (5)

| Product name             | Description                                  | Pricing model                          |
| ------------------------ | -------------------------------------------- | -------------------------------------- |
| Machinedog · Starter     | Solo builder tier, 1M tokens / month        | Recurring — $29/mo and $290/yr         |
| Machinedog · Pro         | Indie operator tier, 5M tokens / month      | Recurring — $99/mo and $990/yr         |
| Machinedog · Business    | Team tier, 20M tokens / month               | Recurring — $299/mo and $2,990/yr      |
| Machinedog · Healthcare  | HIPAA-aligned, BAA on file, 20M tokens / mo | Recurring — $599/mo and $5,990/yr      |
| Machinedog · Enterprise  | Org tier, 100M tokens / month               | Recurring — $1,999/mo and $19,990/yr   |

For each plan, create **two Prices** (monthly and annual). Both should be in USD.

### Token packs (3)

| Product name             | Tokens     | Price |
| ------------------------ | ---------- | ----- |
| Machinedog · Small Pack  | 1,000,000  | $25   |
| Machinedog · Medium Pack | 5,000,000  | $99   |
| Machinedog · Large Pack  | 20,000,000 | $349  |

Each pack should be a one-time payment Price (not recurring).

## 2. Environment variables

Copy each Price ID into the corresponding env var in your `.env`:

```
STRIPE_PRICE_PLAN_STARTER_MONTHLY=price_...
STRIPE_PRICE_PLAN_STARTER_ANNUAL=price_...
STRIPE_PRICE_PLAN_PRO_MONTHLY=price_...
STRIPE_PRICE_PLAN_PRO_ANNUAL=price_...
STRIPE_PRICE_PLAN_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_PLAN_BUSINESS_ANNUAL=price_...
STRIPE_PRICE_PLAN_HEALTHCARE_MONTHLY=price_...
STRIPE_PRICE_PLAN_HEALTHCARE_ANNUAL=price_...
STRIPE_PRICE_PLAN_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_PLAN_ENTERPRISE_ANNUAL=price_...

STRIPE_PRICE_PACK_SMALL=price_...
STRIPE_PRICE_PACK_MEDIUM=price_...
STRIPE_PRICE_PACK_LARGE=price_...
```

Token-pack Price IDs are optional — when unset, checkout falls back to
ad-hoc `price_data` so the demo always works.

## 3. Webhook

Point a Stripe webhook at `${PUBLIC_APP_URL}/api/stripe/webhook` and subscribe
to these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid` (or `invoice.payment_succeeded`)
- `invoice.payment_failed`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## 4. Demo mode (no Stripe)

Demo billing is **gated** behind two conditions — both must be true:

1. `NODE_ENV !== "production"`, AND
2. `BILLING_DEMO_MODE=true`

When both hold AND `STRIPE_SECRET_KEY` is unset, the app runs in **demo
billing mode**:

- The `/billing` page shows a banner: _Stripe disabled — using demo billing._
- "Subscribe" buttons immediately mark the org subscribed and grant the plan's
  monthly tokens via `tokenService.grantMonthly` (annual interval grants 12×).
  The ledger entry is tagged `source = dev_mock`.
- "Buy tokens" buttons immediately credit the pack's tokens with
  `source = dev_mock`.

If Stripe is unconfigured AND demo mode is **not** enabled, the checkout
endpoints return `503 billing_not_configured` so users cannot self-grant
plans or token packs. In production, the API server refuses to boot at all
without `STRIPE_SECRET_KEY`.

Use demo mode for local development and CI only; never set
`BILLING_DEMO_MODE=true` in production.

## 5. Idempotency

All token grants and pack credits are idempotent on the originating Stripe
event id (invoice id for renewals, checkout session id for packs). Replaying a
webhook will not double-credit. Subscription state is upserted by
`stripeSubscriptionId`.
