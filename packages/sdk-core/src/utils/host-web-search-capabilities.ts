/**
 * @fileoverview Host web search capability detection utility
 *
 * Fetches host's /v1/version endpoint to detect web search support.
 * Used by HostManager.getWebSearchCapabilities() method.
 */

import type { WebSearchCapabilities } from '../types/web-search.types';

/**
 * Extract search provider from features array.
 */
function extractSearchProvider(features?: string[]): 'brave' | 'duckduckgo' | 'bing' | null {
  if (!features) return null;
  if (features.includes('brave-search-api')) return 'brave';
  if (features.includes('bing-search-api')) return 'bing';
  if (features.includes('duckduckgo-fallback')) return 'duckduckgo';
  return null;
}

/**
 * Fetch web search capabilities from a host's /v1/version endpoint.
 *
 * @param hostApiUrl - The host's API URL (e.g., 'http://localhost:8080')
 * @returns WebSearchCapabilities object
 *
 * @example
 * ```typescript
 * const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');
 * if (capabilities.supportsWebSearch) {
 *   console.log(`Host uses ${capabilities.provider} search`);
 * }
 * ```
 */
export async function getWebSearchCapabilitiesFromHost(
  hostApiUrl: string
): Promise<WebSearchCapabilities> {
  // Default capabilities (no search support)
  const noCapabilities: WebSearchCapabilities = {
    supportsWebSearch: false,
    supportsInferenceSearch: false,
    supportsStreamingSearch: false,
    supportsWebSocketSearch: false,
    provider: null,
    rateLimitPerMinute: 0,
  };

  try {
    const response = await fetch(`${hostApiUrl}/v1/version`);

    if (!response.ok) {
      return noCapabilities;
    }

    const data = await response.json();
    const features = data.features as string[] | undefined;

    if (!features || features.length === 0) {
      return noCapabilities;
    }

    const supportsWebSearch = features.includes('host-side-web-search');
    const supportsInferenceSearch = features.includes('inference-web-search');
    // v8.7.5+ feature flags for streaming/WebSocket support
    const supportsStreamingSearch = features.includes('streaming-web-search');
    const supportsWebSocketSearch = features.includes('websocket-web-search');
    const provider = extractSearchProvider(features);

    return {
      supportsWebSearch,
      supportsInferenceSearch,
      supportsStreamingSearch,
      supportsWebSocketSearch,
      provider,
      rateLimitPerMinute: supportsWebSearch ? 60 : 0, // Default rate limit
    };
  } catch {
    // Network errors, JSON parse errors, etc.
    return noCapabilities;
  }
}
