#!/usr/bin/env bash
# Phase 8 — guardrail against unsafe HIPAA marketing copy.
#
# Fail CI if any of the forbidden phrases ever appear in repo source. The
# canonical compliance warning lives in
# artifacts/api-server/src/lib/compliance-warnings.ts and the portal mirror.
set -u

FORBIDDEN=(
  "automatically HIPAA compliant"
  "HIPAA certified"
  "safe to enter patient data now"
  "store PHI in Replit"
)

# Search the whole repo, but skip dependency / build / VCS dirs and the
# guardrail files themselves (which legitimately enumerate the phrases).
EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=dist
  --exclude-dir=build
  --exclude-dir=.next
  --exclude-dir=.turbo
  --exclude-dir=.local
  --exclude-dir=generated
  --exclude-dir=attached_assets
)
SELF=$(basename "$0")

found=0
for phrase in "${FORBIDDEN[@]}"; do
  matches=$(grep -RInEi "${EXCLUDES[@]}" --exclude="$SELF" --exclude="ci.yml" --exclude="compliance-warnings.ts" "${phrase}" . 2>/dev/null || true)
  if [ -n "${matches}" ]; then
    echo "✗ Forbidden compliance phrase: \"${phrase}\""
    echo "${matches}"
    echo
    found=1
  fi
done

if [ "${found}" -ne 0 ]; then
  echo "Forbidden HIPAA marketing copy detected. Use compliance-warnings.ts constants instead." >&2
  exit 1
fi
echo "✓ No forbidden compliance phrases found."
