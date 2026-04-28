/**
 * Token markup applied to raw Claude usage before deducting from a client's
 * token balance. The client is billed `rawTokens * TOKEN_MARKUP_MULTIPLIER`
 * to cover Replit AI Integrations costs, infrastructure, and margin.
 *
 * Change in one place — both /prompts and /projects/:id/prompts read from here.
 */
export const TOKEN_MARKUP_MULTIPLIER = 20;

/**
 * Apply the markup and clamp to the available balance so we never overdraw.
 * Returns the integer number of tokens to deduct from the client.
 */
export function computeChargedTokens(rawTokens: number, balance: number): number {
  if (!Number.isFinite(rawTokens) || rawTokens <= 0) return 0;
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  const marked = Math.ceil(rawTokens * TOKEN_MARKUP_MULTIPLIER);
  return Math.min(marked, balance);
}
