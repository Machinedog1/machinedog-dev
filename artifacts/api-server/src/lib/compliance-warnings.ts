/**
 * Phase 8 — standardized compliance warning copy.
 *
 * EVERY surface that talks about PHI / healthcare mode MUST use these
 * constants verbatim. Diverging copy is forbidden and is grep-checked in CI
 * (see .github/workflows/ci.yml — `compliance-copy` job).
 *
 * Forbidden phrases (CI grep):
 *   - "automatically HIPAA compliant"
 *   - "HIPAA certified"
 *   - "safe to enter patient data now"
 *   - "store PHI in Replit"
 */

export const PHI_MODE_LOCKED_WARNING =
  "PHI mode is locked until your organization has an approved Healthcare or Enterprise plan, signed BAA, MFA enforcement, audit logging, and approved HIPAA deployment environment. Do not enter real patient data in this MVP.";

export const PHI_MODE_LOCKED_HEADLINE = "PHI mode locked";

export const PHI_BLOCKED_BLURB =
  "This project does not have PHI access enabled. Do not enter real patient data in this MVP. To work with PHI, your org must have an approved Healthcare or Enterprise plan, signed BAA, MFA enforcement, audit logging, and an approved HIPAA deployment environment.";
