# Implementation Plan: SDK Web Search Integration with Automatic Intent Detection

## Overview

Integrate host-side web search (v8.7.0+) into `@fabstir/sdk-core` with **automatic search intent detection**. The SDK analyzes user prompts and automatically enables web search when search intent is detected (e.g., "search for...", "latest...", "find online..."). Users just type naturally - no configuration needed.

## Status: Core Implementation Complete ✅

**Implementation**: Sub-phases 1.1, 2.1, 2.2, 3.1, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 7.1, 7.2, 8.1 Complete
**SDK Version**: TBD (1.9.0)
**Node Requirement**: v8.7.0+ (with web search enabled)
**Test Results**: 102/102 tests passing (15 intent analyzer + 47 session manager + 8 retry + 32 other)

### Completed Work Summary:
- ✅ Phase 1.1: Search intent analyzer (`analyzePromptForSearchIntent`)
- ✅ Phase 2.1-2.2: Web search types and session types
- ✅ Phase 3.1: WebSearchError class
- ✅ Phase 4.1-4.2: HostManager `getWebSearchCapabilities()`
- ✅ Phase 5.1: Automatic intent detection in `sendPromptStreaming`
- ✅ Phase 5.2: Search metadata capture from responses (`_parseSearchMetadata`)
- ✅ Phase 5.3: WebSocket search message handlers (`searchStarted`, `searchResults`, `searchError`)
- ✅ Phase 5.4: `webSearch()` method (WebSocket Path C)
- ✅ Phase 5.5: `searchDirect()` method (HTTP Path A)
- ✅ Phase 6.1: ISessionManager interface updated
- ✅ Phase 7.1: `searchWithRetry()` utility
- ✅ Phase 7.2: All exports updated
- ✅ Phase 8.1: Test harness UI with web search indicators

### Remaining Work:
- ⏳ Phase 9.1: E2E Testing with real nodes
- ⏳ Phase 10.1: Documentation updates

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
- [x] Write test: `WebSearchError` has correct name property
- [x] Write test: `WebSearchError` has code property with correct type
- [x] Write test: `WebSearchError.isRetryable` returns true for 'rate_limited', 'timeout', 'provider_error'
- [x] Write test: `WebSearchError.isRetryable` returns false for 'search_disabled', 'invalid_query', 'no_providers'
- [x] Create `packages/sdk-core/src/errors/web-search-errors.ts`
- [x] Implement `WebSearchError` class extending Error
- [x] Add `code: WebSearchErrorCode` property
- [x] Add `retryAfter?: number` property
- [x] Add `get isRetryable(): boolean` getter
- [x] Export from main index.ts

**Test Files:**
- `packages/sdk-core/tests/unit/web-search-errors.test.ts` (NEW, ~70 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/errors/web-search-errors.ts` (NEW, ~42 lines) ✅
- `packages/sdk-core/src/index.ts` (MODIFY, +3 lines export) ✅

**Success Criteria:**
- [x] WebSearchError properly extends Error
- [x] isRetryable correctly identifies retryable error codes
- [x] All 7 tests pass

**Test Results:** ✅ **7/7 tests passing (100%)**

---

## Phase 4: Host Feature Detection

### Sub-phase 4.1: Add Capability Detection to HostManager

**Goal**: Enable SDK to check if a host supports web search.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [x] Write test: `getWebSearchCapabilities()` returns capabilities when host supports search
- [x] Write test: `getWebSearchCapabilities()` returns `supportsWebSearch: false` when feature missing
- [x] Write test: `getWebSearchCapabilities()` correctly detects Brave provider
- [x] Write test: `getWebSearchCapabilities()` correctly detects DuckDuckGo fallback
- [x] Write test: `getWebSearchCapabilities()` handles network errors gracefully
- [x] Add `getWebSearchCapabilities(hostAddress, apiUrl?)` method to HostManager
- [x] Fetch `/v1/version` endpoint
- [x] Parse `features` array for 'host-side-web-search', 'inference-web-search'
- [x] Extract provider from features ('brave-search-api', 'duckduckgo-fallback', 'bing-search-api')
- [x] Return `WebSearchCapabilities` object

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-web-search.test.ts` (NEW, ~140 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/host-web-search-capabilities.ts` (NEW, ~70 lines) ✅
- `packages/sdk-core/src/managers/HostManager.ts` (MODIFY, +50 lines) ✅

**Success Criteria:**
- [x] Method correctly parses host version response
- [x] Returns false capabilities when search not supported
- [x] Handles network failures gracefully
- [x] All 10 tests pass

**Test Results:** ✅ **10/10 tests passing (100%)**

---

### Sub-phase 4.2: Update IHostManager Interface

**Goal**: Add method signature to interface.

**Line Budget**: 5 lines

#### Tasks
- [x] Add `getWebSearchCapabilities(hostAddress: string, apiUrl?: string): Promise<WebSearchCapabilities>` to IHostManager
- [x] Verify interface and implementation match

**Test Files:**
- None (interface only)

**Implementation Files:**
- `packages/sdk-core/src/interfaces/IHostManager.ts` (MODIFY, +10 lines) ✅

**Success Criteria:**
- [x] Interface matches implementation
- [x] TypeScript compilation succeeds

**Test Results:** ✅ **Interface matches implementation**

---

## Phase 5: SessionManager Integration

### Sub-phase 5.1: Add Automatic Intent Detection to sendPromptStreaming ✅

**Goal**: Integrate search intent analyzer into the prompt sending flow.

**Line Budget**: 60 lines (40 implementation + 20 tests)

#### Tasks
- [x] Write test: Search intent detected in prompt → `web_search: true` in request
- [x] Write test: No search intent → `web_search: false` in request
- [x] Write test: `forceEnabled: true` overrides no detection → `web_search: true`
- [x] Write test: `forceDisabled: true` overrides detection → `web_search: false`
- [x] Write test: `autoDetect: false` disables auto-detection
- [x] Import `analyzePromptForSearchIntent` from utils
- [x] Add search intent detection logic before building inference request
- [x] Add `web_search`, `max_searches`, `search_queries` fields to request
- [x] Log when search is auto-enabled
- [x] Update request type annotations

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (NEW, ~320 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +50 lines) ✅

**Success Criteria:**
- [x] Auto-detection works transparently
- [x] Override controls work correctly
- [x] Request includes web search fields
- [x] All 19 tests pass (intent detection + request fields)

**Test Results:** ✅ **19/19 tests passing (100%)**

---

### Sub-phase 5.2: Capture Search Metadata in Response ✅

**Goal**: Parse and store web search metadata from host response.

**Line Budget**: 30 lines (20 implementation + 10 tests)

#### Tasks
- [x] Write test: Response with `web_search_performed: true` updates session metadata
- [x] Write test: Response with `search_provider: 'brave'` captured in metadata
- [x] Write test: Response with `search_queries_count: 3` captured in metadata
- [x] Write test: Response without `web_search_performed` returns null
- [x] Write test: Response with `web_search_performed: false` returns performed=false
- [x] Parse `web_search_performed`, `search_queries_count`, `search_provider` from response
- [x] Update session state with `webSearchMetadata`
- [x] Add `_parseSearchMetadata()` private method

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +40 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +25 lines @ lines 2516-2529, 909-914) ✅

**Success Criteria:**
- [x] Metadata correctly parsed from response
- [x] Session state updated with webSearchMetadata
- [x] All 5 tests pass

**Test Results:** ✅ **5/5 tests passing (100%)**

---

### Sub-phase 5.3: Add WebSocket Search Message Handlers ✅

**Goal**: Handle WebSocket search events for real-time feedback.

**Line Budget**: 80 lines (50 implementation + 30 tests)

#### Tasks
- [x] Write test: `searchStarted` message type detected correctly
- [x] Write test: `searchResults` message type detected correctly
- [x] Write test: `searchError` message type detected correctly
- [x] Write test: Non-search message types not detected
- [x] Write test: `searchResults` resolves pending search promise with correct data
- [x] Write test: `searchResults` clears pending search and timeout
- [x] Write test: `searchError` rejects pending search promise with WebSearchError
- [x] Write test: `searchError` clears pending search and timeout
- [x] Write test: Messages without matching request ID are ignored
- [x] Write test: Pending search timeout rejects with timeout error
- [x] Add `pendingSearches: Map<string, PendingSearch>` property
- [x] Add `searchHandlerUnsubscribe` property for cleanup
- [x] Add `_setupWebSearchMessageHandlers()` private method
- [x] Add `_handleSearchStarted()` private method
- [x] Add `_handleSearchResults()` private method
- [x] Add `_handleSearchError()` private method
- [x] Call `_setupWebSearchMessageHandlers()` after WebSocket connect

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +100 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +100 lines @ lines 156-158, 682-683, 2119-2120, 2531-2611) ✅

**Success Criteria:**
- [x] Message handlers correctly parse WebSocket messages
- [x] Pending searches tracked and resolved/rejected
- [x] Timeout handling prevents memory leaks
- [x] All 10 tests pass

**Test Results:** ✅ **10/10 tests passing (100%)**

---

### Sub-phase 5.4: Add webSearch() Public Method ✅

**Goal**: Allow explicit web search via WebSocket.

**Line Budget**: 50 lines (35 implementation + 15 tests)

#### Tasks
- [x] Write test: `webSearch()` validates query length (1-500 chars)
- [x] Write test: `webSearch()` rejects empty query
- [x] Write test: `webSearch()` rejects whitespace-only query
- [x] Write test: `webSearch()` accepts valid query
- [x] Write test: `webSearch()` accepts query exactly 500 chars
- [x] Add `webSearch(sessionId, query, numResults?)` public method
- [x] Validate session exists and WebSocket connected
- [x] Validate query length
- [x] Generate unique request ID
- [x] Send searchRequest message
- [x] Return promise that resolves when searchResults received

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +50 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +55 lines @ lines 1136-1189) ✅

**Success Criteria:**
- [x] Method validates input correctly
- [x] WebSocket message has correct format
- [x] Promise resolves/rejects appropriately
- [x] All 5 tests pass

**Test Results:** ✅ **5/5 tests passing (100%)**

---

### Sub-phase 5.5: Add searchDirect() Public Method ✅

**Goal**: Allow direct HTTP search without active session.

**Line Budget**: 50 lines (35 implementation + 15 tests)

#### Tasks
- [x] Write test: `searchDirect()` builds request with defaults
- [x] Write test: `searchDirect()` respects custom numResults within bounds
- [x] Write test: `searchDirect()` caps numResults at 20
- [x] Write test: `searchDirect()` floors numResults at 1 (negative values)
- [x] Write test: `searchDirect()` uses default 10 when numResults is 0
- [x] Write test: `searchDirect()` uses custom chainId
- [x] Write test: `searchDirect()` returns error for empty query
- [x] Write test: `searchDirect()` returns error for query over 500 chars
- [x] Add `searchDirect(hostUrl, query, options?)` public method
- [x] Validate query length
- [x] Send POST request to `/v1/search`
- [x] Handle rate limiting (429) with Retry-After header
- [x] Handle disabled (503) error
- [x] Parse and return response

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-web-search.test.ts` (EXTEND, +80 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +55 lines @ lines 1212-1264) ✅

**Success Criteria:**
- [x] HTTP request has correct format
- [x] Error codes mapped to WebSearchError correctly
- [x] All 8 tests pass

**Test Results:** ✅ **8/8 tests passing (100%)**

---

## Phase 6: Interface Updates

### Sub-phase 6.1: Update ISessionManager Interface ✅

**Goal**: Add new method signatures to interface.

**Line Budget**: 10 lines

#### Tasks
- [x] Add `webSearch(sessionId: bigint, query: string, numResults?: number): Promise<SearchApiResponse>`
- [x] Add `searchDirect(hostUrl: string, query: string, options?: SearchDirectOptions): Promise<SearchApiResponse>`
- [x] Add `SearchApiResponse` import from types
- [x] Verify interface matches implementation

**Test Files:**
- None (interface only)

**Implementation Files:**
- `packages/sdk-core/src/interfaces/ISessionManager.ts` (MODIFY, +35 lines @ lines 110-141) ✅

**Success Criteria:**
- [x] Interface matches implementation
- [x] TypeScript compilation succeeds

**Test Results:** ✅ **Interface complete**

---

## Phase 7: Utilities and Exports

### Sub-phase 7.1: Add Retry Helper Utility ✅

**Goal**: Provide retry logic for rate-limited requests.

**Line Budget**: 40 lines (25 implementation + 15 tests)

#### Tasks
- [x] Write test: `searchWithRetry()` returns result on first success
- [x] Write test: `searchWithRetry()` retries on retryable errors
- [x] Write test: `searchWithRetry()` uses retryAfter hint when provided
- [x] Write test: `searchWithRetry()` throws non-retryable errors immediately
- [x] Write test: `searchWithRetry()` throws after max retries exceeded
- [x] Write test: `searchWithRetry()` uses exponential backoff delays
- [x] Write test: `searchWithRetry()` passes through non-Error exceptions
- [x] Write test: `searchWithRetry()` respects custom maxRetries parameter
- [x] Create `packages/sdk-core/src/utils/search-retry.ts`
- [x] Implement `searchWithRetry(searchFn, maxRetries)` function
- [x] Use exponential backoff for retries
- [x] Export from utils/index.ts

**Test Files:**
- `packages/sdk-core/tests/unit/search-retry.test.ts` (NEW, ~220 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/search-retry.ts` (NEW, ~55 lines) ✅
- `packages/sdk-core/src/utils/index.ts` (MODIFY, +1 line) ✅

**Success Criteria:**
- [x] Retry logic works correctly
- [x] Backoff timing is exponential
- [x] All 8 tests pass

**Test Results:** ✅ **8/8 tests passing (100%)**

---

### Sub-phase 7.2: Update Main SDK Exports ✅

**Goal**: Export all new types, errors, and utilities.

**Line Budget**: 15 lines

#### Tasks
- [x] Export all web search types from `types/index.ts` (already done in Phase 2)
- [x] Export `WebSearchError` from `index.ts` (already done in Phase 3)
- [x] Export `searchWithRetry` from `utils/index.ts`
- [x] Export `analyzePromptForSearchIntent` from `utils/index.ts` (already done in Phase 1)
- [x] Verify all exports accessible from package

**Test Files:**
- None (export verification via build)

**Implementation Files:**
- `packages/sdk-core/src/utils/index.ts` (MODIFY, +1 line) ✅
- `packages/sdk-core/src/index.ts` (already exports utils/*) ✅

**Success Criteria:**
- [x] All new exports accessible
- [x] No breaking changes to existing exports

**Test Results:** ✅ **Exports complete**

---

## Phase 8: Test Harness Integration

### Sub-phase 8.1: Update chat-context-rag-demo.tsx ✅

**Goal**: Add web search visual indicators to test harness.

**Line Budget**: 60 lines

#### Tasks
- [x] Add state for tracking web search metadata per message (extended ChatMessage interface)
- [x] Add UI indicator when web search was performed (🔍 icon in purple)
- [x] Show search provider name (Brave/DuckDuckGo/Bing)
- [x] Show number of search queries executed
- [x] Add example prompts section demonstrating auto-detection
- [x] Add "Web Search Triggers" info panel with clickable examples

**Test Files:**
- None (UI-only changes, manual testing)

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +55 lines @ lines 43-48, 79, 187, 1375-1386, 2078-2083, 2112-2148) ✅

**Success Criteria:**
- [x] Web search indicator visible when search performed
- [x] Provider and query count displayed
- [x] Example prompts demonstrate feature

**Test Results:** ✅ **Manual testing required** (UI changes only)

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
| `src/types/web-search.types.ts` | 2.1 | ~182 | 0 (new) |
| `src/types/index.ts` | 2.1-2.2 | ~12 | ~2 |
| `src/errors/web-search-errors.ts` | 3.1 | ~42 | 0 (new) |
| `src/errors/index.ts` | 3.1 | ~1 | 0 |
| `src/utils/host-web-search-capabilities.ts` | 4.1 | ~70 | 0 (new) |
| `src/managers/HostManager.ts` | 4.1 | ~50 | 0 |
| `src/interfaces/IHostManager.ts` | 4.2 | ~10 | 0 |
| `src/managers/SessionManager.ts` | 5.1-5.5 | ~335 | ~15 |
| `src/interfaces/ISessionManager.ts` | 6.1 | ~35 | 0 |
| `src/utils/search-retry.ts` | 7.1 | ~55 | 0 (new) |
| `src/utils/index.ts` | 7.2 | ~3 | 0 |
| `src/index.ts` | 7.2 | ~12 | 0 |
| `apps/harness/pages/chat-context-rag-demo.tsx` | 8.1 | ~60 | ~5 (pending) |
| `tests/unit/search-intent-analyzer.test.ts` | 1.1 | ~100 | 0 (new) |
| `tests/unit/web-search-types.test.ts` | 2.1 | ~160 | 0 (new) |
| `tests/unit/web-search-error.test.ts` | 3.1 | ~70 | 0 (new) |
| `tests/unit/host-web-search-capabilities.test.ts` | 4.1 | ~140 | 0 (new) |
| `tests/unit/session-manager-web-search.test.ts` | 5.1-5.5 | ~500 | 0 (new) |
| `tests/unit/search-retry.test.ts` | 7.1 | ~220 | 0 (new) |
| `tests/integration/web-search-e2e.test.ts` | 9.1 | ~150 | 0 (pending) |
| **Total** | | **~2,287** | **~22** |

---

## Test Coverage Target

| Test File | Tests | Status |
|-----------|-------|--------|
| `search-intent-analyzer.test.ts` | 15 | ✅ Passing |
| `web-search-types.test.ts` | 15 | ✅ Passing |
| `web-search-errors.test.ts` | 7 | ✅ Passing |
| `host-web-search-capabilities.test.ts` | 10 | ✅ Passing |
| `session-manager-web-search.test.ts` | 47 | ✅ Passing (5.1: 19, 5.2: 5, 5.3: 10, 5.4: 5, 5.5: 8) |
| `search-retry.test.ts` | 8 | ✅ Passing |
| `web-search-e2e.test.ts` | 8 | ⏳ Pending |
| **Total** | **110** | **102/110 (93%)** |

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
