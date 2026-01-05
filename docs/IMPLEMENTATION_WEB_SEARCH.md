# Implementation Plan: SDK Web Search Integration with Automatic Intent Detection

## Overview

Integrate host-side web search (v8.7.0+) into `@fabstir/sdk-core` with **automatic search intent detection**. The SDK analyzes user prompts and automatically enables web search when search intent is detected (e.g., "search for...", "latest...", "find online..."). Users just type naturally - no configuration needed.

## Status: Phase 2 Complete

**Implementation**: Sub-phases 1.1, 2.1, 2.2 Complete
**SDK Version**: TBD (1.9.0)
**Node Requirement**: v8.7.0+ (with web search enabled)
**Test Results**: 30/30 tests passing (Phase 1.1 + 2.1 + 2.2)

---

## Architecture: Automatic Search Intent Detection

**CRITICAL**: The SDK **automatically detects** when web search is needed based on prompt analysis. The user never configures search flags.

```
User Types Prompt                        SDK Internal Processing
     ↓                                         ↓
"Search for latest NVIDIA specs"        analyzePromptForSearchIntent(prompt)
     ↓                                         ↓
                                        Triggers detected: "search for", "latest"
                                               ↓
                                        web_search: true (auto-enabled)
     ↓                                         ↓
SessionManager.sendPromptStreaming()    Sends to host with web_search: true
     ↓                                         ↓
                                        Host performs web search
                                               ↓
                                        Host injects results into context
                                               ↓
                                        LLM generates response with fresh data
     ↓
User receives answer with real-time info
```

### Key Design Decision: Zero Config UX

**Users just type naturally**:
```typescript
// Triggers detected: "search for"
await sessionManager.sendPromptStreaming(sessionId, 'Search for the latest NVIDIA GPU specs', onToken);
// → web_search: true automatically

// No triggers detected
await sessionManager.sendPromptStreaming(sessionId, 'What is 2+2?', onToken);
// → web_search: false (no overhead)
```

**Override when needed**:
```typescript
// Force-enable even without triggers
await sessionManager.sendPromptStreaming(sessionId, 'Tell me about cats', onToken, { webSearch: { forceEnabled: true } });

// Force-disable even with triggers
await sessionManager.sendPromptStreaming(sessionId, 'Search for news', onToken, { webSearch: { forceDisabled: true } });
```

---

## Goal

Extend SessionManager to support automatic web search that:
1. Detects search intent from user prompts using regex patterns
2. Automatically enables `web_search: true` when triggers found
3. Passes search request to host for processing
4. Returns response with search metadata
5. Requires zero configuration from users
6. Provides override controls when needed

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Search Intent Analyzer

### Sub-phase 1.1: Create Search Intent Analyzer Module

**Goal**: Create the core function that detects search intent from prompts.

**Line Budget**: 80 lines (50 implementation + 30 tests)

#### Tasks
- [x] Write test: `analyzePromptForSearchIntent('Search for NVIDIA specs')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('search the web for AI news')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('look up current Bitcoin price')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('find online the latest updates')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('Google the weather')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('latest AI breakthroughs')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('recent news about Tesla')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('current stock price of AAPL')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('What happened today in tech?')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('news about AI developments in 2026')` returns `true`
- [x] Write test: `analyzePromptForSearchIntent('What is 2+2?')` returns `false`
- [x] Write test: `analyzePromptForSearchIntent('Explain quantum computing')` returns `false`
- [x] Write test: `analyzePromptForSearchIntent('Write a poem about cats')` returns `false`
- [x] Write test: `analyzePromptForSearchIntent('How does photosynthesis work?')` returns `false`
- [x] Write test: `analyzePromptForSearchIntent('')` returns `false` (empty string)
- [x] Create `packages/sdk-core/src/utils/search-intent-analyzer.ts` with regex patterns
- [x] Implement `analyzePromptForSearchIntent(prompt: string): boolean`
- [x] Export function from utils index
- [x] Verify all tests pass

**Test Files:**
- `packages/sdk-core/tests/unit/search-intent-analyzer.test.ts` (NEW, ~100 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/search-intent-analyzer.ts` (NEW, ~50 lines)

**Success Criteria:**
- [x] Detects explicit search requests: "search for", "look up", "find online", "google"
- [x] Detects time-sensitive queries: "latest", "recent", "current", "today"
- [x] Detects year references: 2024, 2025, 2026, etc.
- [x] Does NOT trigger on general questions
- [x] All 15 tests pass

**Test Results:** ✅ **15/15 tests passing (100%)**

---

## Phase 2: Type Definitions

### Sub-phase 2.1: Add Web Search Types

**Goal**: Define all TypeScript types for web search functionality.

**Line Budget**: 100 lines (types only)

#### Tasks
- [x] Create `packages/sdk-core/src/types/web-search.types.ts`
- [x] Add `SearchIntentConfig` interface (autoDetect, customTriggers, forceEnabled, forceDisabled)
- [x] Add `SearchApiRequest` interface (query, numResults, chainId, requestId)
- [x] Add `SearchResultItem` interface (title, url, snippet, source, published_date)
- [x] Add `SearchApiResponse` interface (query, results, resultCount, searchTimeMs, provider, cached)
- [x] Add `WebSearchOptions` interface (enabled, maxSearches, queries)
- [x] Add `WebSearchMetadata` interface (performed, queriesCount, provider)
- [x] Add `WebSearchCapabilities` interface (supportsWebSearch, supportsInferenceSearch, provider, rateLimitPerMinute)
- [x] Add `WebSearchErrorCode` type union
- [x] Add WebSocket message types (WebSearchRequest, WebSearchStarted, WebSearchResults, WebSearchError)
- [x] Export all types from `types/index.ts`
- [x] Verify TypeScript compilation succeeds

**Test Files:**
- `packages/sdk-core/tests/unit/web-search-types.test.ts` (NEW, ~160 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/types/web-search.types.ts` (NEW, ~155 lines) ✅
- `packages/sdk-core/src/types/index.ts` (MODIFY, +3 lines export) ✅

**Success Criteria:**
- [x] All interfaces compile without errors
- [x] Types exported from main SDK entry point
- [x] Type tests verify interface shapes

**Test Results:** ✅ **15/15 tests passing (100%)**

---

### Sub-phase 2.2: Extend Session Types

**Goal**: Add web search fields to existing session types.

**Line Budget**: 20 lines

#### Tasks
- [x] Add `webSearch?: SearchIntentConfig` to `ExtendedSessionConfig` in SessionManager.ts
- [x] Add `webSearchMetadata?: WebSearchMetadata` to `SessionState` in SessionManager.ts
- [x] Verify existing tests still pass
- [x] Verify TypeScript compilation succeeds

**Test Files:**
- None (type-only changes, covered by compilation) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +4 lines) ✅

**Success Criteria:**
- [x] ExtendedSessionConfig includes webSearch optional field
- [x] SessionState includes webSearchMetadata optional field
- [x] No breaking changes to existing types

**Test Results:** ✅ **30/30 tests still passing (no regressions)**

---

## Phase 3: Error Handling

### Sub-phase 3.1: Add WebSearchError Class

**Goal**: Create custom error class for web search failures.

**Line Budget**: 40 lines (25 implementation + 15 tests)

#### Tasks
- [ ] Write test: `WebSearchError` has correct name property
- [ ] Write test: `WebSearchError` has code property with correct type
- [ ] Write test: `WebSearchError.isRetryable` returns true for 'rate_limited', 'timeout', 'provider_error'
- [ ] Write test: `WebSearchError.isRetryable` returns false for 'search_disabled', 'invalid_query', 'no_providers'
- [ ] Create `packages/sdk-core/src/errors/web-search-errors.ts`
- [ ] Implement `WebSearchError` class extending Error
- [ ] Add `code: WebSearchErrorCode` property
- [ ] Add `retryAfter?: number` property
- [ ] Add `get isRetryable(): boolean` getter
- [ ] Export from errors index

**Test Files:**
- `packages/sdk-core/tests/unit/web-search-errors.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/errors/web-search-errors.ts` (NEW, ~25 lines)
- `packages/sdk-core/src/errors/index.ts` (MODIFY, +1 line export)

**Success Criteria:**
- [ ] WebSearchError properly extends Error
- [ ] isRetryable correctly identifies retryable error codes
- [ ] All 4 tests pass

---

## Phase 4: Host Feature Detection

### Sub-phase 4.1: Add Capability Detection to HostManager

**Goal**: Enable SDK to check if a host supports web search.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [ ] Write test: `getWebSearchCapabilities()` returns capabilities when host supports search
- [ ] Write test: `getWebSearchCapabilities()` returns `supportsWebSearch: false` when feature missing
- [ ] Write test: `getWebSearchCapabilities()` correctly detects Brave provider
- [ ] Write test: `getWebSearchCapabilities()` correctly detects DuckDuckGo fallback
- [ ] Write test: `getWebSearchCapabilities()` handles network errors gracefully
- [ ] Add `getWebSearchCapabilities(hostAddress, apiUrl?)` method to HostManager
- [ ] Fetch `/v1/version` endpoint
- [ ] Parse `features` array for 'host-side-web-search', 'inference-web-search'
- [ ] Extract provider from features ('brave-search-api', 'duckduckgo-fallback', 'bing-search-api')
- [ ] Return `WebSearchCapabilities` object

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-web-search.test.ts` (NEW, ~80 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (MODIFY, +40 lines)

**Success Criteria:**
- [ ] Method correctly parses host version response
- [ ] Returns false capabilities when search not supported
- [ ] Handles network failures gracefully
- [ ] All 5 tests pass

---

### Sub-phase 4.2: Update IHostManager Interface

**Goal**: Add method signature to interface.

**Line Budget**: 5 lines

#### Tasks
- [ ] Add `getWebSearchCapabilities(hostAddress: string, apiUrl?: string): Promise<WebSearchCapabilities>` to IHostManager
- [ ] Verify interface and implementation match

**Test Files:**
- None (interface only)

**Implementation Files:**
- `packages/sdk-core/src/interfaces/IHostManager.ts` (MODIFY, +3 lines)

**Success Criteria:**
- [ ] Interface matches implementation
- [ ] TypeScript compilation succeeds

---

## Phase 5: SessionManager Integration

### Sub-phase 5.1: Add Automatic Intent Detection to sendPromptStreaming

**Goal**: Integrate search intent analyzer into the prompt sending flow.

**Line Budget**: 60 lines (40 implementation + 20 tests)

#### Tasks
- [ ] Write test: Search intent detected in prompt → `web_search: true` in request
- [ ] Write test: No search intent → `web_search: false` in request
- [ ] Write test: `forceEnabled: true` overrides no detection → `web_search: true`
- [ ] Write test: `forceDisabled: true` overrides detection → `web_search: false`
- [ ] Write test: `autoDetect: false` disables auto-detection
- [ ] Import `analyzePromptForSearchIntent` from utils
- [ ] Add search intent detection logic before building inference request
- [ ] Add `web_search`, `max_searches`, `search_queries` fields to request
- [ ] Log when search is auto-enabled
- [ ] Update request type annotations

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (NEW, ~120 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +50 lines)

**Success Criteria:**
- [ ] Auto-detection works transparently
- [ ] Override controls work correctly
- [ ] Request includes web search fields
- [ ] All 5 tests pass

---

### Sub-phase 5.2: Capture Search Metadata in Response

**Goal**: Parse and store web search metadata from host response.

**Line Budget**: 30 lines (20 implementation + 10 tests)

#### Tasks
- [ ] Write test: Response with `web_search_performed: true` updates session metadata
- [ ] Write test: Response with `search_provider: 'brave'` captured in metadata
- [ ] Write test: Response with `search_queries_count: 3` captured in metadata
- [ ] Parse `web_search_performed`, `search_queries_count`, `search_provider` from response
- [ ] Update session state with `webSearchMetadata`
- [ ] Persist session with updated metadata

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +40 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +25 lines)

**Success Criteria:**
- [ ] Metadata correctly parsed from response
- [ ] Session state updated with webSearchMetadata
- [ ] All 3 tests pass

---

### Sub-phase 5.3: Add WebSocket Search Message Handlers

**Goal**: Handle WebSocket search events for real-time feedback.

**Line Budget**: 80 lines (50 implementation + 30 tests)

#### Tasks
- [ ] Write test: `searchStarted` message emits event with query and provider
- [ ] Write test: `searchResults` message resolves pending search promise
- [ ] Write test: `searchError` message rejects pending search promise with WebSearchError
- [ ] Write test: Search timeout rejects promise after 30 seconds
- [ ] Add `pendingSearches: Map<string, PendingSearch>` property
- [ ] Add `_setupWebSearchHandlers()` private method
- [ ] Add `_handleSearchStarted()` private method
- [ ] Add `_handleSearchResults()` private method
- [ ] Add `_handleSearchError()` private method
- [ ] Emit 'searchStarted' event for UI progress indication

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +60 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +70 lines)

**Success Criteria:**
- [ ] Message handlers correctly parse WebSocket messages
- [ ] Pending searches tracked and resolved/rejected
- [ ] Timeout handling prevents memory leaks
- [ ] All 4 tests pass

---

### Sub-phase 5.4: Add webSearch() Public Method

**Goal**: Allow explicit web search via WebSocket.

**Line Budget**: 50 lines (35 implementation + 15 tests)

#### Tasks
- [ ] Write test: `webSearch()` sends correct WebSocket message
- [ ] Write test: `webSearch()` returns SearchApiResponse on success
- [ ] Write test: `webSearch()` throws WebSearchError on failure
- [ ] Write test: `webSearch()` validates query length (1-500 chars)
- [ ] Add `webSearch(sessionId, query, numResults?)` public method
- [ ] Validate session exists and WebSocket connected
- [ ] Validate query length
- [ ] Generate unique request ID
- [ ] Send searchRequest message
- [ ] Return promise that resolves when searchResults received

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +45 lines)

**Success Criteria:**
- [ ] Method validates input correctly
- [ ] WebSocket message has correct format
- [ ] Promise resolves/rejects appropriately
- [ ] All 4 tests pass

---

### Sub-phase 5.5: Add searchDirect() Public Method

**Goal**: Allow direct HTTP search without active session.

**Line Budget**: 50 lines (35 implementation + 15 tests)

#### Tasks
- [ ] Write test: `searchDirect()` sends POST to `/v1/search`
- [ ] Write test: `searchDirect()` returns SearchApiResponse on 200
- [ ] Write test: `searchDirect()` throws WebSearchError on 429 (rate limited)
- [ ] Write test: `searchDirect()` throws WebSearchError on 503 (disabled)
- [ ] Add `searchDirect(hostUrl, query, options?)` public method
- [ ] Validate query length
- [ ] Send POST request to `/v1/search`
- [ ] Handle rate limiting (429) with Retry-After header
- [ ] Handle disabled (503) error
- [ ] Parse and return response

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +60 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +45 lines)

**Success Criteria:**
- [ ] HTTP request has correct format
- [ ] Error codes mapped to WebSearchError correctly
- [ ] All 4 tests pass

---

## Phase 6: Interface Updates

### Sub-phase 6.1: Update ISessionManager Interface

**Goal**: Add new method signatures to interface.

**Line Budget**: 10 lines

#### Tasks
- [ ] Add `webSearch(sessionId: bigint, query: string, numResults?: number): Promise<SearchApiResponse>`
- [ ] Add `searchDirect(hostUrl: string, query: string, options?: SearchDirectOptions): Promise<SearchApiResponse>`
- [ ] Verify interface matches implementation

**Test Files:**
- None (interface only)

**Implementation Files:**
- `packages/sdk-core/src/interfaces/ISessionManager.ts` (MODIFY, +8 lines)

**Success Criteria:**
- [ ] Interface matches implementation
- [ ] TypeScript compilation succeeds

---

## Phase 7: Utilities and Exports

### Sub-phase 7.1: Add Retry Helper Utility

**Goal**: Provide retry logic for rate-limited requests.

**Line Budget**: 40 lines (25 implementation + 15 tests)

#### Tasks
- [ ] Write test: `searchWithRetry()` returns result on first success
- [ ] Write test: `searchWithRetry()` retries on rate limit error
- [ ] Write test: `searchWithRetry()` respects retryAfter from error
- [ ] Write test: `searchWithRetry()` throws after max retries
- [ ] Create `packages/sdk-core/src/utils/search-retry.ts`
- [ ] Implement `searchWithRetry(searchFn, maxRetries)` function
- [ ] Use exponential backoff for retries
- [ ] Export from utils

**Test Files:**
- `packages/sdk-core/tests/unit/search-retry.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/search-retry.ts` (NEW, ~30 lines)

**Success Criteria:**
- [ ] Retry logic works correctly
- [ ] Backoff timing is exponential
- [ ] All 4 tests pass

---

### Sub-phase 7.2: Update Main SDK Exports

**Goal**: Export all new types, errors, and utilities.

**Line Budget**: 15 lines

#### Tasks
- [ ] Export all web search types from `index.ts`
- [ ] Export `WebSearchError` from `index.ts`
- [ ] Export `searchWithRetry` from `index.ts`
- [ ] Export `analyzePromptForSearchIntent` from `index.ts`
- [ ] Verify all exports accessible from package

**Test Files:**
- `packages/sdk-core/tests/unit/exports.test.ts` (EXTEND, +10 lines)

**Implementation Files:**
- `packages/sdk-core/src/index.ts` (MODIFY, +12 lines)

**Success Criteria:**
- [ ] All new exports accessible
- [ ] No breaking changes to existing exports

---

## Phase 8: Test Harness Integration

### Sub-phase 8.1: Update chat-context-rag-demo.tsx

**Goal**: Add web search visual indicators to test harness.

**Line Budget**: 60 lines

#### Tasks
- [ ] Add state for tracking web search metadata per message
- [ ] Add UI indicator when web search was performed (🔍 icon)
- [ ] Show search provider name (Brave/DuckDuckGo/Bing)
- [ ] Show number of search queries executed
- [ ] Add example prompts section demonstrating auto-detection
- [ ] Add "Web Search Triggers" info panel

**Test Files:**
- None (UI-only changes, manual testing)

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +60 lines)

**Success Criteria:**
- [ ] Web search indicator visible when search performed
- [ ] Provider and query count displayed
- [ ] Example prompts demonstrate feature

---

## Phase 9: E2E Testing

### Sub-phase 9.1: Integration Tests with Real Node

**Goal**: Test web search against production v8.7.0+ node.

**Line Budget**: 100 lines (tests only)

#### Tasks
- [ ] Write test: Auto-detect enables search for "Search for latest news"
- [ ] Write test: Auto-detect does NOT enable search for "What is 2+2?"
- [ ] Write test: forceDisabled prevents search even with triggers
- [ ] Write test: forceEnabled enables search without triggers
- [ ] Write test: webSearch() returns valid SearchApiResponse
- [ ] Write test: searchDirect() returns valid SearchApiResponse
- [ ] Write test: Rate limiting handled with retry
- [ ] Write test: Invalid query rejected with WebSearchError

**Test Files:**
- `packages/sdk-core/tests/integration/web-search-e2e.test.ts` (NEW, ~150 lines)

**Implementation Files:**
- None (tests only)

**Success Criteria:**
- [ ] All 8 E2E tests pass against real node
- [ ] Tests run in < 60 seconds

---

## Phase 10: Documentation

### Sub-phase 10.1: Update SDK Documentation

**Goal**: Document web search integration for SDK users.

**Line Budget**: 100 lines

#### Tasks
- [ ] Update `docs/node-reference/SDK_WEB_SEARCH_INTEGRATION.md` with SDK usage
- [ ] Add automatic intent detection section
- [ ] Add override controls documentation
- [ ] Add error handling section
- [ ] Add code examples for all three integration paths
- [ ] Update `docs/SDK_API.md` with new methods

**Test Files:**
- None (documentation only)

**Implementation Files:**
- `docs/node-reference/SDK_WEB_SEARCH_INTEGRATION.md` (MODIFY, +100 lines)
- `docs/SDK_API.md` (MODIFY, +30 lines)

**Success Criteria:**
- [ ] All new functionality documented
- [ ] Code examples are accurate and tested

---

## Files Changed Summary

| File | Phase | Lines Added | Lines Modified |
|------|-------|-------------|----------------|
| `src/utils/search-intent-analyzer.ts` | 1.1 | ~50 | 0 (new) |
| `src/types/web-search.types.ts` | 2.1 | ~90 | 0 (new) |
| `src/types/index.ts` | 2.1-2.2 | ~12 | ~2 |
| `src/errors/web-search-errors.ts` | 3.1 | ~25 | 0 (new) |
| `src/errors/index.ts` | 3.1 | ~1 | 0 |
| `src/managers/HostManager.ts` | 4.1 | ~40 | 0 |
| `src/interfaces/IHostManager.ts` | 4.2 | ~3 | 0 |
| `src/managers/SessionManager.ts` | 5.1-5.5 | ~235 | ~10 |
| `src/interfaces/ISessionManager.ts` | 6.1 | ~8 | 0 |
| `src/utils/search-retry.ts` | 7.1 | ~30 | 0 (new) |
| `src/index.ts` | 7.2 | ~12 | 0 |
| `apps/harness/pages/chat-context-rag-demo.tsx` | 8.1 | ~60 | ~5 |
| `tests/unit/search-intent-analyzer.test.ts` | 1.1 | ~100 | 0 (new) |
| `tests/unit/web-search-types.test.ts` | 2.1 | ~30 | 0 (new) |
| `tests/unit/web-search-errors.test.ts` | 3.1 | ~40 | 0 (new) |
| `tests/unit/host-manager-web-search.test.ts` | 4.1 | ~80 | 0 (new) |
| `tests/unit/session-manager-web-search.test.ts` | 5.1-5.5 | ~330 | 0 (new) |
| `tests/unit/search-retry.test.ts` | 7.1 | ~50 | 0 (new) |
| `tests/integration/web-search-e2e.test.ts` | 9.1 | ~150 | 0 (new) |
| **Total** | | **~1,346** | **~17** |

---

## Test Coverage Target

| Test File | Tests | Status |
|-----------|-------|--------|
| `search-intent-analyzer.test.ts` | 15 | Pending |
| `web-search-types.test.ts` | 3 | Pending |
| `web-search-errors.test.ts` | 4 | Pending |
| `host-manager-web-search.test.ts` | 5 | Pending |
| `session-manager-web-search.test.ts` | 20 | Pending |
| `search-retry.test.ts` | 4 | Pending |
| `web-search-e2e.test.ts` | 8 | Pending |
| **Total** | **59** | **0/59** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| False positives in intent detection | Regex patterns carefully tuned; forceDisabled override available |
| False negatives in intent detection | Users can use explicit trigger words; forceEnabled override available |
| Host doesn't support web search | Feature detection via `/v1/version`; graceful fallback to normal inference |
| Rate limiting (429) | Retry helper with exponential backoff; Retry-After header respected |
| Network timeout on search | 30-second timeout; WebSearchError with 'timeout' code |
| Search provider errors | Graceful degradation; DuckDuckGo always available as fallback |

---

## Not In Scope (Future Phases)

- Custom trigger pattern configuration per user
- Search result caching on client side
- Search history/analytics
- Multi-language trigger detection
- Search result preview in UI before injection
- Custom search provider selection
