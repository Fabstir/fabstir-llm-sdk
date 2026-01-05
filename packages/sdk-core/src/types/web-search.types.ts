/**
 * @fileoverview Web search types for SDK integration
 *
 * Types for host-side web search functionality (v8.7.0+).
 * Supports automatic search intent detection, direct API, and WebSocket search.
 */

// ============= Search Intent Configuration =============

/**
 * Configuration for automatic search intent detection.
 */
export interface SearchIntentConfig {
  /** Enable automatic search intent detection (default: true) */
  autoDetect?: boolean;
  /** Custom trigger patterns (regex) to add to detection */
  customTriggers?: RegExp[];
  /** Force web search regardless of intent detection */
  forceEnabled?: boolean;
  /** Force disable web search regardless of intent detection */
  forceDisabled?: boolean;
  /** Maximum number of search queries (1-20, default 5) */
  maxSearches?: number;
  /** Custom search queries (optional, host extracts from prompt if not provided) */
  queries?: string[];
}

// ============= Search API Types =============

/**
 * Request body for /v1/search endpoint.
 */
export interface SearchApiRequest {
  /** Search query (required, max 500 characters) */
  query: string;
  /** Number of results to return (1-20, default 10) */
  numResults?: number;
  /** Chain ID for request tracking */
  chainId?: number;
  /** Request ID for correlation */
  requestId?: string;
}

/**
 * Individual search result item.
 */
export interface SearchResultItem {
  /** Page title */
  title: string;
  /** Result URL */
  url: string;
  /** Text snippet from page */
  snippet: string;
  /** Source domain */
  source: string;
  /** Publication date if available */
  published_date?: string | null;
}

/**
 * Response from /v1/search endpoint.
 */
export interface SearchApiResponse {
  /** Original query */
  query: string;
  /** Array of search results */
  results: SearchResultItem[];
  /** Number of results returned */
  resultCount: number;
  /** Search time in milliseconds */
  searchTimeMs: number;
  /** Search provider used */
  provider: 'brave' | 'duckduckgo' | 'bing';
  /** Whether result was from cache */
  cached: boolean;
  /** Chain ID */
  chainId: number;
  /** Chain name */
  chainName: string;
}

// ============= Inference Integration Types =============

/**
 * Web search options for sendPromptStreaming.
 */
export interface WebSearchOptions {
  /** Enable web search for this request */
  enabled?: boolean;
  /** Maximum number of searches (1-20, default 5) */
  maxSearches?: number;
  /** Custom search queries (optional, host extracts from prompt if not provided) */
  queries?: string[];
}

/**
 * Metadata about web search performed during inference.
 */
export interface WebSearchMetadata {
  /** Whether web search was performed */
  performed: boolean;
  /** Number of search queries executed */
  queriesCount: number;
  /** Search provider used */
  provider: string | null;
}

// ============= Host Capability Types =============

/**
 * Web search capabilities of a host.
 */
export interface WebSearchCapabilities {
  /** Host supports /v1/search endpoint */
  supportsWebSearch: boolean;
  /** Host supports web_search in inference */
  supportsInferenceSearch: boolean;
  /** Search provider available */
  provider: 'brave' | 'duckduckgo' | 'bing' | null;
  /** Rate limit per minute */
  rateLimitPerMinute: number;
}

// ============= Error Types =============

/**
 * Error codes for web search failures.
 */
export type WebSearchErrorCode =
  | 'search_disabled'
  | 'invalid_query'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'no_providers';

// ============= WebSocket Message Types =============

/**
 * Client -> Server: Request web search.
 */
export interface WebSearchRequest {
  type: 'searchRequest';
  query: string;
  num_results?: number;
  request_id?: string;
}

/**
 * Server -> Client: Search started notification.
 */
export interface WebSearchStarted {
  type: 'searchStarted';
  query: string;
  request_id?: string;
  provider: string;
}

/**
 * Server -> Client: Search results.
 */
export interface WebSearchResults {
  type: 'searchResults';
  query: string;
  results: SearchResultItem[];
  result_count: number;
  search_time_ms: number;
  provider: string;
  cached: boolean;
  request_id?: string;
}

/**
 * Server -> Client: Search error.
 */
export interface WebSearchError {
  type: 'searchError';
  error: string;
  error_code: WebSearchErrorCode;
  request_id?: string;
}
