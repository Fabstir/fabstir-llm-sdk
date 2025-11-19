/**
 * LLM Configuration Constants
 *
 * Single source of truth for LLM parameters.
 * Values are loaded from environment variables defined in .env.test
 */

/**
 * Maximum tokens for LLM responses
 * Default: 4000 (suitable for comprehensive answers from 20B+ parameter models)
 */
export const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || process.env.NEXT_PUBLIC_LLM_MAX_TOKENS || '4000', 10);

/**
 * Proof submission interval (tokens per checkpoint)
 * Default: 1000 (production default, optimal gas efficiency)
 */
export const LLM_PROOF_INTERVAL = parseInt(process.env.LLM_PROOF_INTERVAL || process.env.NEXT_PUBLIC_LLM_PROOF_INTERVAL || '1000', 10);

/**
 * Session duration in seconds
 * Default: 86400 (24 hours)
 */
export const LLM_SESSION_DURATION = parseInt(process.env.LLM_SESSION_DURATION || process.env.NEXT_PUBLIC_LLM_SESSION_DURATION || '86400', 10);

// Validation
if (isNaN(LLM_MAX_TOKENS) || LLM_MAX_TOKENS < 1 || LLM_MAX_TOKENS > 32000) {
  console.warn(`[LLM Config] Invalid LLM_MAX_TOKENS: ${process.env.LLM_MAX_TOKENS}, using default 4000`);
}

if (isNaN(LLM_PROOF_INTERVAL) || LLM_PROOF_INTERVAL < 1) {
  console.warn(`[LLM Config] Invalid LLM_PROOF_INTERVAL: ${process.env.LLM_PROOF_INTERVAL}, using default 1000`);
}

if (isNaN(LLM_SESSION_DURATION) || LLM_SESSION_DURATION < 60) {
  console.warn(`[LLM Config] Invalid LLM_SESSION_DURATION: ${process.env.LLM_SESSION_DURATION}, using default 86400`);
}
