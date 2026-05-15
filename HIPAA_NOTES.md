# HIPAA notes

This document is the source of truth for what Machinedog.dev does and does
**not** promise to healthcare prospects today. Please share it verbatim — do
not paraphrase the limitations.

## Healthcare tier scope

The portal exposes a `healthcare` plan tier alongside `starter`, `pro`,
`business`, and `enterprise`. The healthcare tier is designed for teams
building HIPAA-relevant workflows: EHR integrations, patient intake, clinical
decision support, telehealth, etc.

When a healthcare org is created, the portal:

- Sets `organizations.baa_status = "required"`.
- Sets `organizations.hipaa_deployment_status = "required"`.
- Surfaces a compliance review entry point in the portal so the customer can
  request the operator action that flips both flags.
- Activates the PHI gate (Phase 8): file uploads and project secrets are
  scanned for PHI-shaped patterns and blocked unless the org has been
  approved for PHI workloads.
- Surfaces the per-org MFA toggle and the BAA / HIPAA deployment cards in the
  admin UI.

## **The MVP does not handle PHI**

This is the most important sentence in this document. **Do not load real
Protected Health Information into the MVP.**

Concretely:

- We do not have a signed BAA with Replit (the MVP runtime host).
- We do not have HIPAA-eligible compute, storage, KMS, or backup controls
  in place yet — those land in Phase 3 (AWS).
- Audit log retention, breach notification workflows, and audit export are
  not production-grade in the MVP.
- The PHI gate exists to *prevent* accidental PHI ingestion; it is not a
  green light to load real PHI.

If a prospect insists on a PHI workload, the answer is: "We are pre-Phase 3.
Please use synthetic / de-identified data for the MVP. We will let you know
when our HIPAA-ready environment is ready for sign-up."

## BAA required

Before any healthcare org touches PHI in a future Machinedog environment we
will:

1. Have a signed Business Associate Agreement with the customer.
2. Have a signed BAA with every downstream subprocessor that may touch the
   data (host, AI provider, email provider, monitoring provider).
3. Document the data flow end-to-end in the customer's BAA exhibit.

The MVP does not satisfy any of these requirements. The healthcare plan in
the portal exists to (a) show prospects the planned product surface and (b)
collect interest so we know who to call when the HIPAA-ready environment is
live.

## AWS HIPAA-ready environment required

The production runtime for healthcare orgs will be an AWS account under a
signed AWS BAA, using only HIPAA-eligible services. The full plan is in
[`AWS_HIPAA_PHASE_3_PLAN.md`](./AWS_HIPAA_PHASE_3_PLAN.md). Headlines:

- ECS/EKS/Fargate for compute.
- RDS for Postgres, encrypted at rest with per-tenant CMKs.
- S3 for objects, encrypted at rest with per-tenant CMKs and object-lock for
  audit trails.
- KMS for key management; Secrets Manager for credentials.
- CloudTrail + CloudWatch for audit; GuardDuty + WAF for posture.
- Backups + audit exports retained per BAA terms.

The Replit MVP runtime will continue to exist for non-healthcare workloads
after Phase 3.

## AI provider BAA required if PHI touches AI

If PHI is ever sent to an AI model on behalf of a healthcare org, the model
provider must have an active BAA covering that traffic. In practice:

- Today, the MVP routes through Replit's AI Integrations proxy. **No
  provider in this path has a BAA covering PHI for our account.** Therefore
  no PHI may be sent to the prompt console, even on a healthcare org, even
  if the PHI gate were bypassed.
- Phase 3 introduces a per-org AI provider routing layer that picks a
  BAA-covered model when the org is in PHI mode (e.g., Anthropic on AWS
  Bedrock under our AWS BAA, or another provider with a direct BAA). Until
  that lands, healthcare orgs see the same provider menu but the PHI gate
  prevents PHI from reaching it.
- Audit events record the provider, model, and BAA-coverage state of every
  PHI-mode prompt for the post-incident review path.

## What healthcare prospects can do today

- Stand up a healthcare org with synthetic data, walk through the full
  build / publish / token / billing loop.
- See the BAA and HIPAA deployment cards in the admin UI and request a
  compliance review (operators are notified by email — Phase 8).
- Get on the early-access list for the Phase 3 HIPAA-ready environment.

## What healthcare prospects cannot do today

- Load real PHI.
- Sign a BAA with us (we do not offer one in the MVP).
- Receive HIPAA-grade audit exports, breach notifications, or backup
  guarantees.

If any of these are deal-breakers, we will note their requirements and reach
out when Phase 3 is ready. We will not ship promises we cannot keep today.
