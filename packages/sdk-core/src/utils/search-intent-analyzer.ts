/**
 * @fileoverview Search intent analyzer for automatic web search detection
 *
 * Analyzes user prompts to detect search intent using regex patterns.
 * When search intent is detected, the SDK automatically enables web search.
 */

/**
 * Search trigger patterns that indicate web search intent.
 * Organized by category for clarity and maintainability.
 */
const SEARCH_TRIGGERS: RegExp[] = [
  // Explicit search requests
  /\bsearch\s+(?:for|the\s+web|online)?\b/i,
  /\bweb\s*search\b/i,
  /\blook\s*up\b/i,
  /\bfind\s+(?:online|on\s+the\s+web|me)\b/i,
  /\bgoogle\b/i,
  /\bbing\b/i,

  // Time-sensitive queries
  /\blatest\b/i,
  /\brecent(?:ly)?\b/i,
  /\bcurrent(?:ly)?\s+(?:news|price|specs?|status|stock|weather|score)/i,
  /\btoday['']?s?\b/i,
  /\bthis\s+(?:week|month|year)\b/i,
  /\bright\s+now\b/i,
  /\bup\s+to\s+date\b/i,

  // Year references (2024-2029)
  /\b202[4-9]\b/,

  // News and updates
  /\bnews\s+(?:about|on|regarding)\b/i,
  /\bheadlines?\b/i,
  /\bupdates?\s+(?:on|about|regarding)\b/i,

  // Real-time data queries
  /\bstock\s+price\b/i,
  /\bweather\s+(?:in|for|today)\b/i,
  /\bsports?\s+score/i,
  /\bexchange\s+rate\b/i,

  // Comparison with current state
  /\bcompare\s+.*\s+(?:to|with)\s+(?:current|latest|today)/i,
];

/**
 * Analyzes a prompt to detect if it contains search intent.
 *
 * @param prompt - The user's prompt text to analyze
 * @returns true if search intent is detected, false otherwise
 *
 * @example
 * ```typescript
 * analyzePromptForSearchIntent('Search for NVIDIA specs'); // true
 * analyzePromptForSearchIntent('What is 2+2?'); // false
 * ```
 */
export function analyzePromptForSearchIntent(prompt: string): boolean {
  if (!prompt || prompt.trim().length === 0) {
    return false;
  }

  return SEARCH_TRIGGERS.some((trigger) => trigger.test(prompt));
}
