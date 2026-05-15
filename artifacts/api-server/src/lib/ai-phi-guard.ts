/**
 * Phase 4 — server-side PHI prefilter. Runs before any AI provider call when
 * the project does NOT have `phiAllowed=true`. Blocks the call and writes a
 * `phi_blocked` audit row whose metadata only ever contains the matched
 * pattern label, never the offending content.
 *
 * The detector is intentionally conservative: it favors high-precision label
 * patterns ("MRN: 12345678") over raw number heuristics so it doesn't false
 * positive on normal app prompts (zip codes, ints, etc.).
 */

export interface PhiHit {
  /** Stable id for the matched rule (suitable for audit metadata). */
  rule: string;
  /** Human-readable label shown to the user in the block message. */
  label: string;
}

export interface PhiScanResult {
  blocked: boolean;
  hits: PhiHit[];
}

interface Rule {
  id: string;
  label: string;
  re: RegExp;
}

// All patterns are case-insensitive and look for explicit *labels* attached
// to the data — a bare number like "12345678" never trips the filter, but
// "MRN: 12345678" does. This keeps everyday coding prompts (lat/longs, port
// numbers, version strings) usable without nagging the user.
const RULES: Rule[] = [
  {
    id: "ssn_label",
    label: "Social Security Number reference",
    re: /\b(ssn|social\s*security)[\s:#-]*\d{3}-?\d{2}-?\d{4}\b/i,
  },
  {
    id: "ssn_bare",
    label: "Social Security Number pattern",
    re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/,
  },
  {
    id: "dob_label",
    label: "Date of birth (DOB) reference",
    re: /\b(dob|date\s*of\s*birth)\b[^\n]{0,30}?\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/i,
  },
  {
    id: "mrn",
    label: "Medical Record Number (MRN)",
    re: /\b(mrn|medical\s*record(?:\s*number)?)[\s:#-]*[a-z0-9]{5,}\b/i,
  },
  {
    id: "patient_name",
    label: "Patient name reference",
    re: /\b(patient(?:'s)?\s*(?:name|first|last|full\s*name)|pt\.?\s*name)\b[\s:]*[A-Z][a-z]+/i,
  },
  {
    id: "diagnosis",
    label: "Diagnosis / ICD reference",
    re: /\b(diagnosis|dx|icd-?10|icd-?9)\b[\s:]*[A-Z]?\d/i,
  },
  {
    id: "insurance_member",
    label: "Insurance member ID",
    re: /\b(member\s*id|insurance\s*id|policy\s*(?:number|#))[\s:#-]*[A-Z0-9-]{6,}\b/i,
  },
  {
    id: "claim_number",
    label: "Insurance claim number",
    re: /\b(claim\s*(?:number|#|id))[\s:#-]*[A-Z0-9-]{5,}\b/i,
  },
  {
    id: "phone_with_patient",
    label: "Patient + phone number combination",
    re: /\bpatient\b[^\n]{0,80}?\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/i,
  },
  {
    id: "email_with_patient",
    label: "Patient + email address combination",
    re: /\bpatient\b[^\n]{0,80}?\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    id: "address_label",
    label: "Patient street address reference",
    re: /\b(patient(?:'s)?\s*(?:address|street|home\s*address))\b[\s:][^\n]{4,}/i,
  },
  {
    id: "health_plan_beneficiary",
    label: "Health plan beneficiary number",
    re: /\b(beneficiary|subscriber)\s*(?:id|number|#)[\s:#-]*[A-Z0-9-]{6,}\b/i,
  },
];

export function scanForPhi(text: string): PhiScanResult {
  if (!text) return { blocked: false, hits: [] };
  const hits: PhiHit[] = [];
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      hits.push({ rule: rule.id, label: rule.label });
    }
  }
  return { blocked: hits.length > 0, hits };
}
