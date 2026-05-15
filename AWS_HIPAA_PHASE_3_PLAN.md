# AWS HIPAA Phase 3 plan

Phase 3 takes the Phase 2 production runtime and rebuilds it inside AWS under
a signed BAA, using only HIPAA-eligible services. This is the contract for
what changes when we admit our first PHI workload.

Nothing in this document is in the MVP. See [`HIPAA_NOTES.md`](./HIPAA_NOTES.md)
for what we say to healthcare prospects today.

## AWS BAA + account posture

- Sign the AWS Business Associate Addendum on the AWS account that hosts
  the HIPAA workload. The non-PHI workload stays in a separate account.
- AWS Organizations with two OUs: `hipaa` and `general`. SCPs deny any
  non-HIPAA-eligible service in the `hipaa` OU.
- All resources tagged `org=<orgId>` for cost + audit attribution.

## HIPAA-eligible services we will use

Only the AWS-published HIPAA-eligible service list. The MVP-relevant subset:

- **Compute:** ECS on Fargate (preferred) or EKS on Fargate.
- **Database:** RDS for PostgreSQL with encryption at rest (KMS) and
  encrypted backups; Multi-AZ enabled.
- **Object storage:** S3 with default encryption (SSE-KMS), object-lock
  enabled on the audit prefix, versioning on, lifecycle rules to Glacier.
- **Key management:** KMS with per-tenant CMKs (one CMK per healthcare org).
- **Secrets:** AWS Secrets Manager for credentials. Rotation enabled for
  Stripe + Clerk + AI provider keys.
- **Monitoring + audit:** CloudTrail (org-wide, multi-region, log-file
  integrity validation), CloudWatch Logs with KMS encryption, CloudWatch
  Metrics for ops dashboards.
- **Posture:** GuardDuty enabled in every region, AWS Config for
  configuration drift, Security Hub aggregating findings.
- **Edge:** WAF v2 in front of the ALB / CloudFront distribution; managed
  rule sets + a custom rate-limit rule per tenant.

Services explicitly excluded from the HIPAA path even though we use them
elsewhere: anything not on the AWS HIPAA-eligible list, plus any third
party without a current BAA.

## Network topology

- One VPC per environment (`prod`, `staging`).
- Private subnets for ECS tasks + RDS; public subnets only for the ALB and
  the NAT gateway.
- VPC endpoints for S3, KMS, Secrets Manager, Logs, ECR — so workspace
  egress to AWS services never traverses the public internet.
- Per-workspace egress allow-list at the SG / NACL level. Default-deny.

## Backups + audit retention

- RDS automated backups + 35-day point-in-time recovery, with weekly
  manual snapshots retained per BAA terms.
- S3 versioning + object-lock on `org/<orgId>/audit/`; replication to a
  separate region's bucket for DR.
- CloudTrail logs delivered to an org-wide bucket with object-lock; the
  audit account is the only one with read access.
- Per-tenant audit export (CSV / JSON) generated weekly into the org's
  S3 prefix.

## Healthcare-org gating

Two flags on `organizations` already exist in the schema and govern what
the runtime will admit:

- `baa_status` — paperwork. Operator-controlled. Must be `active` before
  any PHI-mode workload is allowed.
- `hipaa_deployment_status` — infrastructure posture. Operator-controlled.
  Must be `approved` before the runtime will accept the org onto the AWS
  HIPAA cluster.

Both flags must be set before PHI mode is unlocked. The portal already
exposes the BAA + HIPAA deployment cards in the admin UI; Phase 3 hooks the
runtime gate to the same flags.

## PHI-mode approval

A separate flag (added in Phase 3) gates the actual AI lane:

1. Customer requests PHI mode from the compliance page.
2. Operator reviews: BAA on file? HIPAA deployment approved? AI provider
   BAA covers this customer's anticipated traffic? MFA required for every
   member?
3. Operator flips `phi_mode_status = "approved"` on the org. An audit event
   is written and the customer is notified.
4. The runtime now accepts PHI workloads:
   - The PHI gate stops blocking uploads / secrets that match PHI patterns.
   - Prompt routing picks a BAA-covered model (e.g., Anthropic on AWS
     Bedrock under our AWS BAA).
   - Workspace placement pins to the HIPAA cluster.
5. Revoking PHI mode immediately re-engages the PHI gate and flushes the
   workspace placement back to the general cluster on next idle-suspend.

## Out of scope for Phase 3

- FedRAMP / CJIS — not on the roadmap.
- On-prem / air-gapped — not on the roadmap.
- Customer-managed keys *outside* AWS KMS — Phase 4+ if there is demand.

## Open questions

- Single-region (us-east-1) vs multi-region? Multi-region doubles cost; the
  call is "single region until a customer's BAA exhibit forces it."
- BYO-KMS support: do we let a healthcare org bring their own CMK from
  their own AWS account? Likely yes for enterprise; deferred for the first
  cohort.
- AI provider routing: do we ever fall back to a non-BAA provider for a
  PHI org if the BAA provider is down? Default answer is no — fail closed.
