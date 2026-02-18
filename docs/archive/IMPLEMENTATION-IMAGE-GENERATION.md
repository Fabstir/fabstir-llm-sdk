# Implementation Plan: Image Generation SDK Integration

## Overview

Add text-to-image generation support to `packages/sdk-core/` using the host node's FLUX.2 Klein 4B diffusion sidecar (v8.16.0+). The SDK sends image generation requests over the existing E2E encrypted WebSocket channel and receives base64-encoded PNG responses.

```
SDK SessionManager.generateImage()
  → encrypted_message { action: "image_generation", prompt, size, steps, ... }
  → WebSocket (E2E encrypted, XChaCha20-Poly1305)
  → Host Node (SGLang Diffusion sidecar → FLUX.2 Klein 4B)
  ← encrypted_response { type: "image_generation_result", image: "<base64 PNG>", ... }
```

## Status: All Phases Complete

**Implementation**: Image Generation SDK Support
**Package**: `@fabstir/sdk-core`
**Network**: Base Sepolia (Chain ID: 84532)
**Prerequisite**: Working `@fabstir/sdk-core` with E2E encrypted streaming (v1.13.4+), Host node v8.16.0+ with `DIFFUSION_ENDPOINT` configured
**Specification**: `docs/node-reference/SDK_IMAGE_GENERATION_INTEGRATION.md`

### Phases Overview:
- [x] Phase 1: Types, Error Class & Utilities
- [x] Phase 2: Feature Detection
- [x] Phase 3: SessionManager Image Generation
- [x] Phase 4: Test Harness UI Integration
- [x] Phase 5: Auto-Detect Image Generation Intent from Text Prompts

---

## Summary of Changes

| Aspect | Current (Inference Only) | New (+ Image Generation) |
|--------|--------------------------|--------------------------|
| SessionManager methods | `sendPromptStreaming()` | + `generateImage()`, `generateImageHttp()` |
| Message flow | Prompt → encrypted_chunk stream → stream_end | Prompt → single encrypted_response |
| Routing key | (none — inference is default) | `"action": "image_generation"` in payload |
| Response AAD | Part of inference stream | Fixed: `"encrypted_image_response"` |
| Billing | Per-token | Per megapixel-steps formula |
| Rate limiting | None client-side | 5 req/min sliding window (client-side) |
| Feature detection | Web search flags | + `image-generation`, `websocket-image-generation`, `http-image-generation` |

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport (production) | Encrypted WebSocket | Same E2E channel as inference; no plaintext image leakage |
| Transport (testing) | HTTP POST `/v1/images/generate` | Stateless, no session handshake; CI-friendly |
| Response pattern | Single `encrypted_response` (not streaming) | Images arrive as one base64 blob, not chunked |
| Rate limiter | Client-side sliding window | Prevents unnecessary round trips; not a security measure |
| Session reuse | Same encrypted session as inference | Shares sessionKey, wsClient, messageIndex counter |
| AAD handling | `decryptIncomingMessage()` reads from `payload.aadHex` | No special-casing needed for different AAD values |

### Node Interface (v8.16.0 — Reuse As-Is)

| Interface | Transport | Used By |
|-----------|-----------|---------|
| `POST /v1/images/generate` | HTTP (plaintext) | `generateImageHttp()` — testing only |
| `encrypted_message` with `action: "image_generation"` | WebSocket (encrypted) | `generateImage()` — production |
| `encrypted_response` with `type: "image_generation_result"` | WebSocket (encrypted) | Response handler |
| `encrypted_response` with `type: "image_generation_error"` | WebSocket (encrypted) | Error handler |
| `GET /v1/version` → `features[]` | HTTP | Feature detection |

### Existing SDK Patterns to Reuse

| Pattern | Source File | Lines |
|---------|------------|-------|
| Feature detection utility | `src/utils/host-web-search-capabilities.ts` | 1-81 |
| Error class with retry | `src/errors/web-search-errors.ts` | 1-43 |
| Type file structure | `src/types/web-search.types.ts` | 1-186 |
| Encrypted message send | `SessionManager.ts` `sendEncryptedMessage()` | 1812-1908 |
| Encrypted response receive | `SessionManager.ts` onMessage handler | 888-950 |
| HostManager capability method | `HostManager.ts` `getWebSearchCapabilities()` | 934-965 |

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## New Files

```
packages/sdk-core/
├── src/
│   ├── types/
│   │   └── image-generation.types.ts        # Types & validation (~100 lines)
│   ├── errors/
│   │   └── image-generation-errors.ts       # Error class (~45 lines)
│   └── utils/
│       ├── image-generation-billing.ts      # Billing helper (~40 lines)
│       ├── image-generation-rate-limiter.ts  # Rate limiter (~50 lines)
│       └── host-image-generation-capabilities.ts  # Feature detection (~60 lines)
└── tests/unit/
    ├── image-generation-types.test.ts
    ├── image-generation-errors.test.ts
    ├── image-generation-billing.test.ts
    ├── image-generation-rate-limiter.test.ts
    ├── image-generation-capabilities.test.ts
    ├── host-manager-image-generation.test.ts
    ├── session-generate-image.test.ts
    └── session-generate-image-http.test.ts
```

---

## Phase 1: Types, Error Class & Utilities

### Sub-phase 1.1: Image Generation Types

**Goal**: Define TypeScript interfaces for image generation requests, responses, capabilities, and validation.

**Line Budget**: 100 lines (`src/types/image-generation.types.ts`)

#### Tasks
- [ ] Define `ALLOWED_IMAGE_SIZES` const tuple: `['256x256', '512x512', '768x768', '1024x1024', '1024x768', '768x1024']`
- [ ] Define `ImageSize` type from tuple: `typeof ALLOWED_IMAGE_SIZES[number]`
- [ ] Define `SafetyLevel` type: `'strict' | 'moderate' | 'permissive'`
- [ ] Define `ImageGenerationErrorCode` type: `'RATE_LIMIT_EXCEEDED' | 'VALIDATION_FAILED' | 'PROMPT_BLOCKED' | 'DIFFUSION_SERVICE_UNAVAILABLE' | 'IMAGE_GENERATION_FAILED' | 'ENCRYPTION_FAILED'`
- [ ] Define `ImageGenerationOptions` interface: `model?, size?, steps?, seed?, negativePrompt?, guidanceScale?, safetyLevel?, chainId?`
- [ ] Define `SafetyInfo` interface: `promptSafe, outputSafe, safetyLevel`
- [ ] Define `BillingInfo` interface: `generationUnits, modelMultiplier, megapixels, steps`
- [ ] Define `ImageGenerationResult` interface: `image, model, size, steps, seed, processingTimeMs, safety, billing, provider, chainId, chainName, nativeToken`
- [ ] Define `ImageGenerationCapabilities` interface: `supportsImageGeneration, supportsEncryptedWebSocket, supportsHttp, hasSafetyClassifier, hasOutputClassifier, hasBilling, hasContentHashes`
- [ ] Define `MAX_PROMPT_LENGTH = 2000` constant
- [ ] Implement `isValidImageSize(size: string): size is ImageSize` type guard
- [ ] Add `export * from './image-generation.types';` to `src/types/index.ts`
- [ ] Write 10 tests in `tests/unit/image-generation-types.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/image-generation-types.test.ts` (~80 lines)

**Tests (10):**
1. [ ] `ALLOWED_IMAGE_SIZES contains exactly 6 entries`
2. [ ] `ALLOWED_IMAGE_SIZES includes '1024x1024'`
3. [ ] `ALLOWED_IMAGE_SIZES includes '768x1024' (portrait)`
4. [ ] `isValidImageSize returns true for '512x512'`
5. [ ] `isValidImageSize returns true for '1024x768'`
6. [ ] `isValidImageSize returns false for '800x600'`
7. [ ] `isValidImageSize returns false for empty string`
8. [ ] `isValidImageSize returns false for '1024'` (no separator)
9. [ ] `ImageGenerationOptions accepts all optional fields`
10. [ ] `ImageGenerationResult has required shape` (construct object, verify fields)

**Reference Files:**
- `src/types/web-search.types.ts` (structure template)
- `docs/node-reference/SDK_IMAGE_GENERATION_INTEGRATION.md:80-143` (request/response interfaces)

**Success Criteria:**
- [ ] All 10 type tests pass
- [ ] TypeScript compilation succeeds
- [ ] `src/types/image-generation.types.ts` is ≤ 100 lines

---

### Sub-phase 1.2: Image Generation Error Class

**Goal**: Custom error class for image generation failures with retry support.

**Line Budget**: 45 lines (`src/errors/image-generation-errors.ts`)

#### Tasks
- [ ] Define `RETRYABLE_CODES` array: `['RATE_LIMIT_EXCEEDED', 'IMAGE_GENERATION_FAILED']`
- [ ] Implement `ImageGenerationError extends Error` with `code: ImageGenerationErrorCode`, `retryAfter?: number`
- [ ] Add `get isRetryable(): boolean` getter checking against `RETRYABLE_CODES`
- [ ] Set `Object.setPrototypeOf(this, ImageGenerationError.prototype)` in constructor
- [ ] Add `export { ImageGenerationError } from './errors/image-generation-errors';` to `src/index.ts`
- [ ] Write 8 tests in `tests/unit/image-generation-errors.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/image-generation-errors.test.ts` (~70 lines)

**Tests (8):**
1. [ ] `error.name is 'ImageGenerationError'`
2. [ ] `error.code stores the provided error code`
3. [ ] `error.message stores the provided message`
4. [ ] `error instanceof Error is true`
5. [ ] `error instanceof ImageGenerationError is true`
6. [ ] `RATE_LIMIT_EXCEEDED is retryable`
7. [ ] `IMAGE_GENERATION_FAILED is retryable`
8. [ ] `PROMPT_BLOCKED is not retryable`

**Reference Files:**
- `src/errors/web-search-errors.ts` (exact pattern to follow)

**Success Criteria:**
- [ ] All 8 error tests pass
- [ ] `src/errors/image-generation-errors.ts` is ≤ 45 lines

---

### Sub-phase 1.3: Billing Utility

**Goal**: Pure functions for estimating image generation cost and parsing size strings.

**Line Budget**: 40 lines (`src/utils/image-generation-billing.ts`)

#### Tasks
- [ ] Implement `parseSize(sizeStr: string): { width: number; height: number }` — splits on `x`, validates both dimensions are positive integers, throws on invalid format
- [ ] Implement `estimateGenerationUnits(width: number, height: number, steps: number, modelMultiplier?: number): number` — formula: `(width * height / 1_048_576) * (steps / 20) * (modelMultiplier ?? 1.0)`
- [ ] Add `export * from './image-generation-billing';` to `src/utils/index.ts`
- [ ] Write 12 tests in `tests/unit/image-generation-billing.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/image-generation-billing.test.ts` (~90 lines)

**Billing Formula Reference:**
```
generationUnits = (width * height / 1,048,576) * (steps / 20) * modelMultiplier
```

**Tests (12):**
1. [ ] `parseSize('1024x1024') returns { width: 1024, height: 1024 }`
2. [ ] `parseSize('512x512') returns { width: 512, height: 512 }`
3. [ ] `parseSize('1024x768') returns { width: 1024, height: 768 }`
4. [ ] `parseSize('invalid') throws`
5. [ ] `parseSize('') throws`
6. [ ] `parseSize('1024') throws` (no separator)
7. [ ] `estimateGenerationUnits(256, 256, 4) ≈ 0.0125` (node docs: ~0.013)
8. [ ] `estimateGenerationUnits(512, 512, 4) = 0.05`
9. [ ] `estimateGenerationUnits(512, 512, 20) = 0.25`
10. [ ] `estimateGenerationUnits(1024, 1024, 4) = 0.2`
11. [ ] `estimateGenerationUnits(1024, 1024, 20) = 1.0`
12. [ ] `estimateGenerationUnits(1024, 1024, 20, 2.0) = 2.0` (custom multiplier)

**Reference Files:**
- `docs/node-reference/SDK_IMAGE_GENERATION_INTEGRATION.md:522-567` (billing formula + reference table)

**Success Criteria:**
- [ ] All 12 billing tests pass
- [ ] Values match node docs reference table
- [ ] `src/utils/image-generation-billing.ts` is ≤ 40 lines

---

### Sub-phase 1.4: Rate Limiter

**Goal**: Client-side sliding window rate limiter to prevent unnecessary network round trips.

**Line Budget**: 50 lines (`src/utils/image-generation-rate-limiter.ts`)

#### Tasks
- [ ] Implement `ImageGenerationRateLimiter` class with `constructor(maxRequests: number = 5, windowMs: number = 60_000)`
- [ ] Implement `canGenerate(): boolean` — prunes expired timestamps, returns whether under limit
- [ ] Implement `recordRequest(): void` — prunes expired, adds current timestamp
- [ ] Implement `getTimeUntilNextSlot(): number` — returns 0 if under limit, else ms until oldest expires
- [ ] Implement `getRemainingRequests(): number` — returns slots remaining in window
- [ ] Implement private `prune(): void` — removes timestamps older than window
- [ ] Add `export * from './image-generation-rate-limiter';` to `src/utils/index.ts`
- [ ] Write 10 tests in `tests/unit/image-generation-rate-limiter.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/image-generation-rate-limiter.test.ts` (~100 lines)

**Tests (10):**
1. [ ] `canGenerate() returns true initially`
2. [ ] `getRemainingRequests() returns 5 initially` (default max)
3. [ ] `after 1 request, getRemainingRequests() returns 4`
4. [ ] `after 5 requests, canGenerate() returns false`
5. [ ] `after 5 requests, getRemainingRequests() returns 0`
6. [ ] `after 5 requests, getTimeUntilNextSlot() returns > 0`
7. [ ] `after window expires, canGenerate() returns true again` (use `vi.useFakeTimers`)
8. [ ] `getTimeUntilNextSlot() returns 0 when under limit`
9. [ ] `custom maxRequests=2 limits after 2 requests`
10. [ ] `custom windowMs=1000 expires after 1 second`

**Success Criteria:**
- [ ] All 10 rate limiter tests pass
- [ ] Fake timers used for deterministic time tests
- [ ] `src/utils/image-generation-rate-limiter.ts` is ≤ 50 lines

---

## Phase 2: Feature Detection

### Sub-phase 2.1: Feature Detection Utility

**Goal**: Fetch host's `/v1/version` endpoint to detect image generation support.

**Line Budget**: 60 lines (`src/utils/host-image-generation-capabilities.ts`)

#### Tasks
- [ ] Implement `getImageGenerationCapabilitiesFromHost(hostApiUrl: string): Promise<ImageGenerationCapabilities>`
- [ ] Fetch `${hostApiUrl}/v1/version`, parse JSON, read `features` array
- [ ] Check for `'image-generation'` → `supportsImageGeneration`
- [ ] Check for `'websocket-image-generation'` → `supportsEncryptedWebSocket`
- [ ] Check for `'http-image-generation'` → `supportsHttp`
- [ ] Check for `'prompt-safety-classifier'` → `hasSafetyClassifier`
- [ ] Check for `'output-safety-classifier'` → `hasOutputClassifier`
- [ ] Check for `'image-generation-billing'` → `hasBilling`
- [ ] Check for `'image-content-hashes'` → `hasContentHashes`
- [ ] Return all-false `ImageGenerationCapabilities` on any error (network, parse, non-OK status)
- [ ] Add `export * from './host-image-generation-capabilities';` to `src/utils/index.ts`
- [ ] Write 9 tests in `tests/unit/image-generation-capabilities.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/image-generation-capabilities.test.ts` (~110 lines)

**Tests (9):**
1. [ ] `host with all 8 image gen feature flags returns full capabilities`
2. [ ] `host with only 'image-generation' flag returns supportsImageGeneration: true, others false`
3. [ ] `host with safety classifier flags sets hasSafetyClassifier and hasOutputClassifier`
4. [ ] `host without image gen features returns all false`
5. [ ] `host with empty features array returns all false`
6. [ ] `host with no features property returns all false`
7. [ ] `network error returns all false`
8. [ ] `non-OK HTTP response (500) returns all false`
9. [ ] `JSON parse error returns all false`

**Reference Files:**
- `src/utils/host-web-search-capabilities.ts` (exact pattern to follow)
- `docs/node-reference/SDK_IMAGE_GENERATION_INTEGRATION.md:42-72` (feature flags)

**Success Criteria:**
- [ ] All 9 feature detection tests pass
- [ ] Graceful degradation on any error
- [ ] `src/utils/host-image-generation-capabilities.ts` is ≤ 70 lines

---

### Sub-phase 2.2: HostManager Integration

**Goal**: Add `getImageGenerationCapabilities()` method to HostManager.

**Line Budget**: 30 lines added to `src/managers/HostManager.ts`

#### Tasks
- [ ] Import `getImageGenerationCapabilitiesFromHost` from `../utils/host-image-generation-capabilities`
- [ ] Import `ImageGenerationCapabilities` type from `../types/image-generation.types`
- [ ] Add `async getImageGenerationCapabilities(hostAddress: string, apiUrl?: string): Promise<ImageGenerationCapabilities>` method
- [ ] When `apiUrl` not provided: resolve via `this.getHostInfo(hostAddress)` → `hostInfo.apiUrl`
- [ ] On resolution failure: return all-false capabilities (no throw)
- [ ] Delegate to `getImageGenerationCapabilitiesFromHost(hostApiUrl)`
- [ ] Write 5 tests in `tests/unit/host-manager-image-generation.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/host-manager-image-generation.test.ts` (~70 lines)

**Tests (5):**
1. [ ] `returns capabilities from host with image gen support`
2. [ ] `returns all-false when host lacks image gen features`
3. [ ] `uses provided apiUrl when given (skips contract lookup)`
4. [ ] `resolves apiUrl from contract when not provided`
5. [ ] `returns all-false when host info resolution fails`

**Reference Files:**
- `src/managers/HostManager.ts:934-965` (`getWebSearchCapabilities()` — exact pattern)

**Success Criteria:**
- [ ] All 5 HostManager tests pass
- [ ] Existing HostManager tests still pass
- [ ] HostManager.ts grows by ≤ 30 lines

---

## Phase 3: SessionManager Image Generation

### Sub-phase 3.1: `generateImage()` — Encrypted WebSocket

**Goal**: Add `generateImage()` method to SessionManager for production encrypted image generation.

**Line Budget**: 140 lines added to `src/managers/SessionManager.ts`

#### Tasks

**Imports & Setup:**
- [ ] Import `ImageGenerationOptions`, `ImageGenerationResult`, `ImageGenerationErrorCode`, `isValidImageSize` from `../types/image-generation.types`
- [ ] Import `ImageGenerationError` from `../errors/image-generation-errors`
- [ ] Import `ImageGenerationRateLimiter` from `../utils/image-generation-rate-limiter`
- [ ] Add private field: `private imageGenRateLimiter = new ImageGenerationRateLimiter()`

**Method `generateImage(sessionId: string, prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>`:**
- [ ] Validate session exists (look up in `this.sessions` map)
- [ ] Validate session is active (status check)
- [ ] Validate prompt is non-empty string and ≤ `MAX_PROMPT_LENGTH` (2000 chars)
- [ ] Validate `options.size` with `isValidImageSize()` if provided
- [ ] Validate `options.steps` is 1-100 if provided
- [ ] Check rate limiter with `this.imageGenRateLimiter.canGenerate()`
- [ ] Throw `ImageGenerationError('RATE_LIMIT_EXCEEDED')` with `retryAfter` from `getTimeUntilNextSlot()`
- [ ] Require encrypted session (`this.sessionKey` and `this.encryptionManager` must exist)
- [ ] Ensure WebSocket connected (reuse existing connection pattern)
- [ ] Call `sendEncryptedInit()` (node clears sessions after completion)
- [ ] Build inner payload: `{ action: 'image_generation', prompt, model?, size, steps, safetyLevel, chainId, ...optional fields }`
- [ ] Encrypt with `this.encryptionManager.encryptMessage(this.sessionKey, JSON.stringify(payload), this.messageIndex++)`
- [ ] Build envelope: `{ type: 'encrypted_message', session_id, id: 'img-${Date.now()}-...', payload }`
- [ ] Send via `this.wsClient.sendWithoutResponse(envelope)`
- [ ] Set up response listener via `this.wsClient.onMessage()` (returns unsubscribe function)
- [ ] On `encrypted_response`: decrypt, check `parsed.type`:
  - `'image_generation_result'` → record rate limit, resolve with result
  - `'image_generation_error'` → reject with `ImageGenerationError(code, message)`
  - Other type → ignore (not our response)
- [ ] On `error` message type: reject with `ImageGenerationError('IMAGE_GENERATION_FAILED')`
- [ ] Set 30-second timeout → reject with `ImageGenerationError('IMAGE_GENERATION_FAILED')`
- [ ] Guard against double-resolution with `isResolved` flag
- [ ] Clean up: `clearTimeout`, `unsubscribe()` on resolve/reject
- [ ] Write 14 tests in `tests/unit/session-generate-image.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/session-generate-image.test.ts` (~240 lines)

**Tests (14):**
1. [ ] `successful image generation returns ImageGenerationResult`
2. [ ] `sends encrypted_message with action: 'image_generation' routing key`
3. [ ] `includes prompt, size, steps in encrypted payload`
4. [ ] `uses default size 1024x1024 when not specified`
5. [ ] `uses default steps 4 when not specified`
6. [ ] `includes optional model field in payload when provided`
7. [ ] `node error response (PROMPT_BLOCKED) rejects with ImageGenerationError`
8. [ ] `node error response (DIFFUSION_SERVICE_UNAVAILABLE) rejects with ImageGenerationError`
9. [ ] `session not found throws SDKError`
10. [ ] `empty prompt throws ImageGenerationError VALIDATION_FAILED`
11. [ ] `prompt exceeding 2000 chars throws ImageGenerationError VALIDATION_FAILED`
12. [ ] `invalid size throws ImageGenerationError VALIDATION_FAILED`
13. [ ] `steps out of range (0 or 101) throws ImageGenerationError VALIDATION_FAILED`
14. [ ] `rate limit exceeded throws ImageGenerationError RATE_LIMIT_EXCEEDED with retryAfter`

**Reference Files:**
- `SessionManager.ts:1812-1908` (`sendEncryptedMessage()` — encryption + envelope pattern)
- `SessionManager.ts:888-950` (onMessage handler — response listener pattern)
- `docs/node-reference/SDK_IMAGE_GENERATION_INTEGRATION.md:147-266` (encrypted WebSocket protocol)

**Success Criteria:**
- [ ] All 14 generateImage tests pass
- [ ] Existing SessionManager tests still pass
- [ ] SessionManager.ts grows by ≤ 140 lines

---

### Sub-phase 3.2: `generateImageHttp()` — Testing Path

**Goal**: Add `generateImageHttp()` method to SessionManager for development and CI testing (no encryption, no session).

**Line Budget**: 55 lines added to `src/managers/SessionManager.ts`

#### Tasks
- [ ] Implement `async generateImageHttp(hostUrl: string, prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>`
- [ ] Validate prompt is non-empty string and ≤ `MAX_PROMPT_LENGTH` (2000 chars)
- [ ] Validate `options.size` with `isValidImageSize()` if provided
- [ ] Validate `options.steps` is 1-100 if provided
- [ ] Build request body: `{ prompt, model?, size, steps, safetyLevel, ...optional fields }`
- [ ] `fetch()` POST to `${hostUrl}/v1/images/generate` with `Content-Type: application/json`
- [ ] Map HTTP status codes to error types:
  - 400 with "blocked" in body → `ImageGenerationError('PROMPT_BLOCKED')`
  - 400 otherwise → `ImageGenerationError('VALIDATION_FAILED')`
  - 503 → `ImageGenerationError('DIFFUSION_SERVICE_UNAVAILABLE')`
  - 500 → `ImageGenerationError('IMAGE_GENERATION_FAILED')`
- [ ] On 200: parse JSON body as `ImageGenerationResult`, return it
- [ ] Write 10 tests in `tests/unit/session-generate-image-http.test.ts`
- [ ] Verify all tests pass

**Test File**: `tests/unit/session-generate-image-http.test.ts` (~130 lines)

**Tests (10):**
1. [ ] `successful 200 response returns parsed ImageGenerationResult`
2. [ ] `sends POST to /v1/images/generate with correct body`
3. [ ] `uses default size 1024x1024 when not specified`
4. [ ] `includes optional model field in request body when provided`
5. [ ] `400 with 'blocked' in body throws PROMPT_BLOCKED`
6. [ ] `400 without 'blocked' throws VALIDATION_FAILED`
7. [ ] `503 throws DIFFUSION_SERVICE_UNAVAILABLE`
8. [ ] `500 throws IMAGE_GENERATION_FAILED`
9. [ ] `empty prompt throws VALIDATION_FAILED (client-side)`
10. [ ] `prompt exceeding 2000 chars throws VALIDATION_FAILED (client-side)`

**Reference Files:**
- `docs/node-reference/SDK_IMAGE_GENERATION_INTEGRATION.md:440-519` (HTTP endpoint)

**Success Criteria:**
- [ ] All 10 HTTP tests pass
- [ ] Existing SessionManager tests still pass
- [ ] SessionManager.ts grows by ≤ 55 additional lines (≤ 195 total new lines from Phase 3)

---

## File Summary

| File | Max Lines | Purpose | Phase |
|------|-----------|---------|-------|
| `src/types/image-generation.types.ts` | 100 | Types, interfaces, validation | 1.1 |
| `src/errors/image-generation-errors.ts` | 45 | Error class with retry support | 1.2 |
| `src/utils/image-generation-billing.ts` | 40 | Billing estimation helpers | 1.3 |
| `src/utils/image-generation-rate-limiter.ts` | 50 | Client-side rate limiter | 1.4 |
| `src/utils/host-image-generation-capabilities.ts` | 70 | Feature detection utility | 2.1 |
| **Total new source** | **≤ 305** | | |

| File | Max Added Lines | Purpose | Phase |
|------|----------------|---------|-------|
| `src/types/index.ts` | +1 | Re-export image gen types | 1.1 |
| `src/index.ts` | +1 | Export error class | 1.2 |
| `src/utils/index.ts` | +3 | Re-export utilities | 1.3, 1.4, 2.1 |
| `src/managers/HostManager.ts` | +30 | `getImageGenerationCapabilities()` | 2.2 |
| `src/managers/SessionManager.ts` | +195 | `generateImage()` + `generateImageHttp()` | 3.1, 3.2 |
| **Total modified source** | **≤ 230** | | |

| Test File | ~Lines | Tests | Phase |
|-----------|--------|-------|-------|
| `tests/unit/image-generation-types.test.ts` | 80 | 10 | 1.1 |
| `tests/unit/image-generation-errors.test.ts` | 70 | 8 | 1.2 |
| `tests/unit/image-generation-billing.test.ts` | 90 | 12 | 1.3 |
| `tests/unit/image-generation-rate-limiter.test.ts` | 100 | 10 | 1.4 |
| `tests/unit/image-generation-capabilities.test.ts` | 110 | 9 | 2.1 |
| `tests/unit/host-manager-image-generation.test.ts` | 70 | 5 | 2.2 |
| `tests/unit/session-generate-image.test.ts` | 240 | 14 | 3.1 |
| `tests/unit/session-generate-image-http.test.ts` | 130 | 10 | 3.2 |
| **Total tests** | **~890** | **78** | |

---

## Execution Order

| Step | Sub-phase | Dependencies | Status |
|------|-----------|-------------|--------|
| 1 | 1.1 Image Generation Types | None | |
| 2 | 1.2 Error Class | 1.1 (types) | |
| 3 | 1.3 Billing Utility | 1.1 (types) | |
| 4 | 1.4 Rate Limiter | None | |
| 5 | 2.1 Feature Detection Utility | 1.1 (types) | |
| 6 | 2.2 HostManager Integration | 1.1 (types), 2.1 (utility) | |
| 7 | 3.1 SessionManager `generateImage()` | 1.1-1.4, 2.1 | |
| 8 | 3.2 SessionManager `generateImageHttp()` | 1.1, 1.2 | |

---

## Verification

### Unit Tests (after each sub-phase)
```bash
cd /workspace/packages/sdk-core && pnpm test --run
```

### Build Check (after all sub-phases)
```bash
cd /workspace/packages/sdk-core && pnpm build
```

### Manual Test — HTTP (no encryption needed)
```bash
# Verify host supports image generation
curl http://<host>:8080/v1/version | jq '.features'
# Should include: "image-generation", "http-image-generation"

# Generate an image via HTTP
curl -X POST http://<host>:8080/v1/images/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A serene mountain lake at golden hour", "size": "512x512", "steps": 4}'
```

### Manual Test — SDK Integration
```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';

const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
const sdk = new FabstirSDKCore({ chainId: ChainId.BASE_SEPOLIA, rpcUrl: '...', contractAddresses: chain.contracts });
await sdk.authenticate(privateKey);

const sessionManager = await sdk.getSessionManager();
const hostManager = await sdk.getHostManager();

// Feature detection
const caps = await hostManager.getImageGenerationCapabilities(hostAddress);
console.log('Image gen supported:', caps.supportsImageGeneration);

// Start session
const { sessionId } = await sessionManager.startSession({ ... });

// Generate image (encrypted WebSocket)
const result = await sessionManager.generateImage(sessionId, 'A cat astronaut floating in space', {
  size: '512x512',
  steps: 4,
});

console.log(`Generated in ${result.processingTimeMs}ms, seed=${result.seed}`);
console.log(`Billing: ${result.billing.generationUnits} units`);
// Display: `data:image/png;base64,${result.image}`
```

---

---

## Phase 4: Test Harness UI Integration

### Overview

Add image generation UI to the test harness page `apps/harness/pages/chat-context-rag-demo.tsx` so the feature can be manually tested against a live host node running FLUX.2 Klein 4B (v8.16.0+).

### Summary of Changes

| Aspect | Detail |
|--------|--------|
| File modified | `apps/harness/pages/chat-context-rag-demo.tsx` |
| New UI section | "Image Generation" panel below RAG section |
| SDK methods used | `sm.generateImage()`, `hm.getImageGenerationCapabilities()` |
| Imports added | `ALLOWED_IMAGE_SIZES`, `ImageGenerationError` from `@fabstir/sdk-core` |

### Execution Order

| Step | Sub-phase | Dependencies | Status |
|------|-----------|-------------|--------|
| 1 | 4.1 Imports & State | Phases 1-3 (SDK layer) | [x] |
| 2 | 4.2 Capability Check & Generate Handler | 4.1 | [x] |
| 3 | 4.3 UI Section & Image Display | 4.1, 4.2 | [x] |
| 4 | 4.4 Build & Smoke Test | 4.1-4.3 | [x] |

---

### Sub-phase 4.1: Imports & State Variables

**Goal**: Add SDK image generation imports and React state to the demo page.

**Line Budget**: +20 lines modified in `apps/harness/pages/chat-context-rag-demo.tsx`

#### Tasks
- [x] Import `ALLOWED_IMAGE_SIZES` and `ImageGenerationError` from `@fabstir/sdk-core` (add to existing import block at line 25)
- [x] Add inline type for `GeneratedImageEntry`: `{ image: string; prompt: string; size: string; steps: number; seed: number; processingTimeMs: number; billing?: { generationUnits: number } }`
- [x] Add state: `const [imagePrompt, setImagePrompt] = useState("")`
- [x] Add state: `const [imageSize, setImageSize] = useState<string>("512x512")`
- [x] Add state: `const [imageSteps, setImageSteps] = useState(4)`
- [x] Add state: `const [isGeneratingImage, setIsGeneratingImage] = useState(false)`
- [x] Add state: `const [generatedImages, setGeneratedImages] = useState<GeneratedImageEntry[]>([])`
- [x] Add state: `const [imageError, setImageError] = useState<string | null>(null)`
- [x] Add state: `const [imageCapabilities, setImageCapabilities] = useState<any>(null)`
- [x] Verify page still compiles with `pnpm dev` (no runtime errors on load)

**Reference Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx:22-42` (existing import block)
- `apps/harness/pages/chat-context-rag-demo.tsx:90-165` (existing state pattern)

**Success Criteria:**
- [x] Page compiles and loads without errors
- [x] No existing functionality broken
- [x] New state variables are accessible in component

---

### Sub-phase 4.2: Capability Check & Generate Handler

**Goal**: Add image generation capability detection in `startSession()` and a `handleGenerateImage()` handler function.

**Line Budget**: +55 lines added to `apps/harness/pages/chat-context-rag-demo.tsx`

#### Tasks

**Capability check (add inside `startSession()`, after the "Ready to chat" message at ~line 1441):**
- [x] Call `const imgCaps = await (hm as any).getImageGenerationCapabilities(host.address, host.endpoint)`
- [x] Store result: `setImageCapabilities(imgCaps)`
- [x] Log capability status: `addMessage("system", imgCaps.supportsImageGeneration ? "🎨 Host supports image generation" : "⚠️ Host does not support image generation")`
- [x] Wrap in try/catch (non-fatal — just log warning if detection fails)
- [x] Reset image state on new session: `setGeneratedImages([]); setImageError(null); setImageCapabilities(null)`

**`handleGenerateImage()` function (add after `sendMessage()` function, ~line 1626):**
- [x] Get session manager: `const sm = sdk?.getSessionManager() as any`
- [x] Get session ID: `const currentSessionId = (window as any).__currentSessionId || sessionId`
- [x] Guard: return early if `!sm || !currentSessionId || !imagePrompt.trim()`
- [x] Set loading state: `setIsGeneratingImage(true); setImageError(null)`
- [x] Add user message: `addMessage("user", "[Image Gen] " + imagePrompt)`
- [x] Call: `const result = await sm.generateImage(currentSessionId.toString(), imagePrompt.trim(), { size: imageSize as any, steps: imageSteps })`
- [x] On success: prepend to `generatedImages` array with `image`, `prompt`, `size`, `steps`, `seed`, `processingTimeMs`, `billing`
- [x] On success: `addMessage("system", "🎨 Generated ${result.size} image in ${result.processingTimeMs}ms (seed: ${result.seed})")`
- [x] On error: check `error instanceof ImageGenerationError`, format `[${error.code}] ${error.message}` with optional retry info
- [x] On error: `setImageError(msg); addMessage("system", "❌ Image generation failed: " + msg)`
- [x] Finally: `setIsGeneratingImage(false)`

**Reference Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx:1452-1626` (`sendMessage()` — pattern for error handling, manager access, window globals)
- `apps/harness/pages/chat-context-rag-demo.tsx:1108-1449` (`startSession()` — where to add capability check)
- `packages/sdk-core/src/managers/SessionManager.ts:3329-3389` (`generateImage()` method signature)

**Success Criteria:**
- [x] `handleGenerateImage()` function compiles without errors
- [x] Capability check in `startSession()` runs without breaking session flow
- [x] Errors are caught and displayed, never crash the page

---

### Sub-phase 4.3: UI Section & Image Display

**Goal**: Add the image generation UI panel to the page JSX, positioned between the RAG section and Control Buttons.

**Line Budget**: +85 lines added to `apps/harness/pages/chat-context-rag-demo.tsx`

#### Tasks

**Image Generation panel (insert after RAG Document Upload section closing `</div>` at ~line 2591, before Control Buttons at ~line 2593):**

- [x] Add conditional render: `{sessionId && imageCapabilities?.supportsImageGeneration && (` ... `)}`
- [x] Panel container: `<div className="bg-green-50 p-4 rounded-lg mb-4 border border-green-200">`
- [x] Header: `<h3 className="font-semibold mb-3 text-green-900">🎨 Image Generation (FLUX.2 Klein 4B)</h3>`
- [x] Prompt input: `<input type="text" value={imagePrompt} onChange={...} placeholder="Describe the image..." />` with same styling as chat input
- [x] Size dropdown: `<select value={imageSize} onChange={...}>` with options from `ALLOWED_IMAGE_SIZES`
- [x] Steps input: `<input type="number" min={1} max={50} value={imageSteps} onChange={...} />` with label "Steps:"
- [x] Generate button: `<button onClick={handleGenerateImage} disabled={isGeneratingImage || !imagePrompt.trim()}>` showing "Generating..." when loading
- [x] Error display: `{imageError && <div className="text-red-600 text-sm mt-2">{imageError}</div>}`
- [x] Generated images gallery: map over `generatedImages`, show `<img src={"data:image/png;base64," + img.image} />` with metadata below (size, steps, seed, time, billing units)
- [x] Each image card: show prompt text, size badge, processing time, seed number
- [x] Add "Try:" quick-prompt buttons: `"A cat astronaut floating in space"`, `"A serene mountain lake at golden hour"`
- [x] Capability info line: `<p className="text-xs text-gray-600 mt-2">💡 WebSocket: {imageCapabilities.supportsEncryptedWebSocket ? "✓" : "✗"} | HTTP: {imageCapabilities.supportsHttp ? "✓" : "✗"} | Safety: {imageCapabilities.hasSafetyClassifier ? "✓" : "✗"}</p>`

**Also add a fallback panel when host lacks image gen support:**
- [x] `{sessionId && imageCapabilities && !imageCapabilities.supportsImageGeneration && (` ... `)}`
- [x] Show: `<div className="bg-gray-50 p-3 rounded-lg mb-4 border border-gray-200 text-sm text-gray-500">🎨 Image generation not available — host does not have FLUX.2 diffusion sidecar</div>`

**Reference Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx:2527-2591` (RAG section — layout pattern)
- `apps/harness/pages/chat-context-rag-demo.tsx:2489-2525` (Web search triggers — quick-prompt button pattern)
- `apps/harness/pages/chat-context-rag-demo.tsx:2468-2487` (Input area — styling pattern)

**Success Criteria:**
- [x] Image generation section renders when host supports it
- [x] Fallback message shown when host lacks support
- [x] Generated images display correctly as base64 PNGs
- [x] Quick-prompt buttons populate the input field
- [x] Controls disabled during generation
- [x] No layout issues with existing sections

---

### Sub-phase 4.4: Build & Smoke Test

**Goal**: Rebuild SDK, clear caches, verify end-to-end that the harness page loads and the image generation UI is functional.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [x] Build SDK: `cd /workspace/packages/sdk-core && pnpm build:esm && pnpm build:cjs`
- [x] Clear caches: `rm -rf /workspace/apps/harness/.next && rm -rf /workspace/apps/harness/node_modules/.cache`
- [x] Force re-resolve: `cd /workspace && pnpm install --force`
- [x] Start harness: `cd /workspace/apps/harness && pnpm dev`
- [x] Verify page loads at `http://localhost:3006/chat-context-rag-demo` without console errors
- [ ] Verify existing chat functionality still works (connect → start session → send message)
- [ ] Verify image generation UI section appears after session start
- [ ] Verify capability detection message appears in chat log
- [ ] Verify generate button is clickable with valid prompt
- [x] Report result (success or specific error) via ntfy

**Success Criteria:**
- [x] Page loads without errors
- [x] All existing functionality intact
- [x] Image generation UI visible and interactive
- [x] SDK types resolve correctly (no import errors)

---

### File Summary — Phase 4

| File | Max Added Lines | Purpose | Sub-phase |
|------|----------------|---------|-----------|
| `apps/harness/pages/chat-context-rag-demo.tsx` | +160 | Full image generation UI | 4.1-4.3 |
| **Total modified** | **≤ 160** | | |

---

## Progress Tracker

- [x] Phase 1: Types, Error Class & Utilities (Sub-phases 1.1, 1.2, 1.3, 1.4)
- [x] Phase 2: Feature Detection (Sub-phases 2.1, 2.2)
- [x] Phase 3: SessionManager Image Generation (Sub-phases 3.1, 3.2)
- [x] Phase 4: Test Harness UI Integration (Sub-phases 4.1, 4.2, 4.3, 4.4)
- [x] Phase 5: Auto-Detect Image Generation Intent (Sub-phases 5.1, 5.2)
- [x] Phase 6: Fix Multi-Turn Prompt Intent Detection (Sub-phases 6.1, 6.2)

---

---

## Phase 5: Auto-Detect Image Generation Intent from Text Prompts

### Overview

When a user types "Generate an image of a cat astronaut in 1024x1024 resolution" without enabling the Image button, the prompt goes through `sendPromptStreaming()` (LLM inference). The LLM responds with text pretending it generated an image (with placeholders), but no actual image is produced.

The SDK already has auto-detection for **web search intent** (`search-intent-analyzer.ts`, 67 lines). We apply the same pattern for image generation: detect intent, extract parameters (size, steps), and auto-route to `generateImage()`.

```
User types: "Generate an image of a cat astronaut in 1024x1024"
  → sendPromptStreaming() receives prompt
  → analyzePromptForImageIntent() detects intent + extracts size=1024x1024
  → auto-routes to generateImage("a cat astronaut", { size: "1024x1024" })
  → fires onImageGenerated(result) callback to UI
  → returns "Image generated successfully" as text response
```

**Approach**: SDK-side (primary) + node-side fallback (default OFF, node developer handles separately). This plan covers the SDK-side work only.

### Existing Patterns to Reuse

| Pattern | Source File | Lines |
|---------|------------|-------|
| Search intent analyzer | `src/utils/search-intent-analyzer.ts` | 1-67 |
| `ALLOWED_IMAGE_SIZES` constant | `src/types/image-generation.types.ts` | 10-17 |
| `ImageGenerationOptions` interface | `src/types/image-generation.types.ts` | 37-46 |
| `ImageGenerationResult` interface | `src/types/image-generation.types.ts` | 63-76 |
| `isValidImageSize()` guard | `src/types/image-generation.types.ts` | 92-94 |
| `generateImage()` method | `src/managers/SessionManager.ts` | 3411-3539 |
| `PromptOptions` interface | `src/types/index.ts` | 135-139 |

### New / Modified Files

```
packages/sdk-core/
├── src/
│   ├── types/
│   │   └── index.ts                        # +2 lines (onImageGenerated callback)
│   ├── utils/
│   │   └── image-intent-analyzer.ts        # NEW (~90 lines)
│   ├── managers/
│   │   └── SessionManager.ts               # +15 lines (auto-route)
│   └── index.ts                            # +1 line (export)
└── tests/unit/
    └── image-intent-analyzer.test.ts       # NEW (~200 lines)
```

### Execution Order

| Step | Sub-phase | Dependencies | Status |
|------|-----------|-------------|--------|
| 1 | 5.1 Image Intent Analyzer | Phases 1-3 (types, generateImage) | [x] |
| 2 | 5.2 SDK Integration | 5.1 | [x] |

---

### Sub-phase 5.1: Image Intent Analyzer

**Goal**: Create `analyzePromptForImageIntent()` that detects image generation intent from natural language prompts and extracts parameters (size, steps, clean prompt).

**New file**: `src/utils/image-intent-analyzer.ts` (max 90 lines)
**Test file**: `tests/unit/image-intent-analyzer.test.ts` (max 200 lines)

#### Tasks

**Tests (write first — RED):**
- [ ] Write intent detection trigger tests (9 cases)
- [ ] Write false positive prevention tests (7 cases)
- [ ] Write size extraction tests (4 cases)
- [ ] Write steps extraction tests (3 cases)
- [ ] Write clean prompt generation tests (3 cases)
- [ ] Verify all tests FAIL (RED)

**Implementation (GREEN):**
- [ ] Implement `ImageIntentResult` interface: `{ isImageIntent, cleanPrompt?, extractedOptions? }`
- [ ] Implement `IMAGE_TRIGGERS` regex array (English only)
- [ ] Implement `SIZE_PATTERN` regex — parse `NNNxNNN`, validate against `ALLOWED_IMAGE_SIZES`
- [ ] Implement `STEPS_PATTERN` regex — parse `N steps`, clamp 1-100
- [ ] Implement clean prompt logic — strip trigger prefix, size text, steps text
- [ ] Implement `analyzePromptForImageIntent(prompt): ImageIntentResult`
- [ ] Verify all tests PASS (GREEN)

**Intent trigger tests (9):**

| # | Prompt | Expected |
|---|--------|----------|
| 1 | `"generate an image of a cat"` | `isImageIntent: true` |
| 2 | `"draw a sunset over mountains"` | `true` |
| 3 | `"create a picture of a house"` | `true` |
| 4 | `"paint a landscape"` | `true` |
| 5 | `"sketch a portrait"` | `true` |
| 6 | `"make an image of a dog"` | `true` |
| 7 | `"render a 3D scene"` | `true` |
| 8 | `"please generate an image of a cat"` | `true` (polite prefix) |
| 9 | `"can you draw me a cat?"` | `true` |

**False positive tests (7):**

| # | Prompt | Expected |
|---|--------|----------|
| 1 | `"describe the image"` | `false` |
| 2 | `"what is in this image"` | `false` |
| 3 | `"how to draw in CSS"` | `false` |
| 4 | `"the painting was beautiful"` | `false` |
| 5 | `"image processing algorithm"` | `false` |
| 6 | `"Hello"` | `false` |
| 7 | `""` | `false` |

**Size extraction tests (4):**

| # | Prompt | Expected size |
|---|--------|---------------|
| 1 | `"generate image of cat in 1024x1024"` | `"1024x1024"` |
| 2 | `"draw cat 512x512 resolution"` | `"512x512"` |
| 3 | `"generate image of cat in 999x999"` | `undefined` (not in `ALLOWED_IMAGE_SIZES`) |
| 4 | `"generate image of cat"` | `undefined` (use default) |

**Steps extraction tests (3):**

| # | Prompt | Expected steps |
|---|--------|----------------|
| 1 | `"generate image of cat with 20 steps"` | `20` |
| 2 | `"draw cat 4 steps"` | `4` |
| 3 | `"generate image of cat"` | `undefined` (use default) |

**Clean prompt tests (3):**

| # | Prompt | Expected cleanPrompt |
|---|--------|----------------------|
| 1 | `"Generate an image of a cat astronaut in 1024x1024 resolution"` | `"a cat astronaut"` |
| 2 | `"draw me a sunset with 20 steps"` | `"a sunset"` |
| 3 | `"create a picture of a house"` | `"a house"` |

**Reference Files:**
- `src/utils/search-intent-analyzer.ts` (exact pattern to follow)
- `src/types/image-generation.types.ts:10-17` (`ALLOWED_IMAGE_SIZES`)

**Success Criteria:**
- [ ] All 26 tests pass
- [ ] `src/utils/image-intent-analyzer.ts` is ≤ 90 lines
- [ ] `tests/unit/image-intent-analyzer.test.ts` is ≤ 200 lines

---

### Sub-phase 5.2: SDK Integration (PromptOptions + Auto-Route + Export)

**Goal**: Wire `analyzePromptForImageIntent()` into `sendPromptStreaming()` with `onImageGenerated` callback.

**Modified files:**
- `src/types/index.ts` (+2 lines)
- `src/managers/SessionManager.ts` (+15 lines)
- `src/index.ts` (+1 line)

#### Tasks

**PromptOptions callback:**
- [ ] Add `import type { ImageGenerationResult } from './image-generation.types'` to `src/types/index.ts`
- [ ] Add `onImageGenerated?: (result: ImageGenerationResult) => void` to `PromptOptions`

**Auto-route in sendPromptStreaming():**
- [ ] Import `analyzePromptForImageIntent` in SessionManager
- [ ] Insert image intent check after session validation (line ~782), before RAG injection (line ~785)
- [ ] If intent detected: call `this.generateImage(sessionIdStr, cleanPrompt, extractedOptions)`
- [ ] Fire `options.onImageGenerated(result)` callback
- [ ] Return `"Image generated successfully"` as text response
- [ ] Add `console.warn` debug logging with `[SDK:sendPromptStreaming]` prefix

**Export:**
- [ ] Export `analyzePromptForImageIntent` and `ImageIntentResult` from `src/index.ts`

**Build & Pack:**
- [ ] Build: `pnpm build:esm && pnpm build:cjs`
- [ ] Bump version to 1.14.10
- [ ] Pack: `pnpm pack`

**Code sketch** (SessionManager.ts, line ~783, inside try block before RAG injection):
```typescript
// Auto-detect image generation intent (like search intent auto-detection)
const imageIntent = analyzePromptForImageIntent(prompt);
if (imageIntent.isImageIntent) {
  console.warn(`[SDK:sendPromptStreaming] Image intent detected, routing to generateImage()`);
  const imgResult = await this.generateImage(
    sessionIdStr,
    imageIntent.cleanPrompt || prompt,
    imageIntent.extractedOptions
  );
  if (options?.onImageGenerated) {
    options.onImageGenerated(imgResult);
  }
  return `Image generated successfully`;
}
```

**Reference Files:**
- `src/managers/SessionManager.ts:781-785` (insertion point)
- `src/utils/search-intent-analyzer.ts` (integration pattern)

**Success Criteria:**
- [ ] Build succeeds
- [ ] Existing tests still pass
- [ ] Tarball v1.14.10 produced
- [ ] `src/types/index.ts` grows by ≤ 2 lines
- [ ] `src/managers/SessionManager.ts` grows by ≤ 15 lines
- [ ] `src/index.ts` grows by ≤ 1 line

---

### Out of Scope (Phase 5)

- **Node-side fallback**: Node developer adds `needs_image_generation()` (default OFF via `AUTO_IMAGE_ROUTING` env var). Separate work.
- **OpenAI bridge**: `/v1/images/generations` endpoint mapping. Node developer work.
- **Claude bridge image support**: Separate phase.
- **Multilingual triggers**: English only for now.

### Verification (Phase 5)

1. Unit tests: `pnpm test --run tests/unit/image-intent-analyzer.test.ts`
2. Build: `pnpm build:esm && pnpm build:cjs`
3. Pack: `pnpm pack` (v1.14.10)
4. UI installs tarball + clears Next.js cache
5. Manual: Type "Generate an image of a cat in 1024x1024" without Image button → image via callback
6. Manual: Type "What is in this image?" → no false positive, goes to LLM
7. Manual: Type "Hello" → normal text inference

### File Summary — Phase 5

| File | Max Lines | Purpose | Sub-phase |
|------|-----------|---------|-----------|
| `src/utils/image-intent-analyzer.ts` | 90 (new) | Intent detection + parameter extraction | 5.1 |
| `tests/unit/image-intent-analyzer.test.ts` | 200 (new) | TDD tests (26 cases) | 5.1 |
| `src/types/index.ts` | +2 | `onImageGenerated` callback | 5.2 |
| `src/managers/SessionManager.ts` | +15 | Auto-route in `sendPromptStreaming()` | 5.2 |
| `src/index.ts` | +1 | Export utility | 5.2 |
| **Total new source** | **≤ 90** | | |
| **Total modified source** | **≤ 18** | | |
| **Total new tests** | **≤ 200** | **26 test cases** | |

---

---

## Phase 6: Fix Multi-Turn Prompt Intent Detection

### Overview

Phase 5's image intent auto-detection works on the **first message** of a session but **fails on subsequent messages**. Production testing confirmed:

- **First message** (no history): prompt is `"Generate an image of a cat..."` → `^generate` regex matches → works
- **Subsequent messages** (with history): UI builds multi-turn prompt `"User: [msg1]\nAssistant: [resp1]\nUser: Generate an image..."` → `^` anchors at `"User:"` prefix → regex fails → falls through to LLM → LLM hallucinates fake download links like `https://files.example.com/cat-astronaut-1024.png`

**Root cause**: `analyzePromptForImageIntent()` uses `^`-anchored regexes (intentionally, to prevent false positives like "how to draw in CSS"). But the UI sends multi-turn formatted prompts to `sendPromptStreaming()`, so subsequent messages have conversation history prepended.

**Fix**: Add `extractLastUserMessage()` helper that extracts the last user turn from multi-turn prompts, then run the `^`-anchored regex on that extracted message only. This preserves false-positive prevention while handling real production prompt formats.

### Evidence from browser console

```
# First message (works): previousMessageCount=0, prompt is clean
[IMG-RAG] 15. fullPromptLength: 54, fullPromptPreview: 'Generate an image of a cat astronaut floating in space'
[SDK:sendPromptStreaming] Image intent detected, routing to generateImage()

# Second message (fails): previousMessageCount=2, prompt has "User:" prefix + history
[IMG-RAG] 15. fullPromptLength: 187, fullPromptPreview: 'User: Generate an image...at 1024x1024 resolution'
# NO "Image intent detected" log → falls through to LLM → fake download link response
```

### Multi-turn prompt formats to handle

| Format | Source | Example |
|--------|--------|---------|
| Plain text | First message (any UI) | `"Generate an image of a cat"` |
| `User: ... \nAssistant: ...` | Harness UI / some UIs | `"User: msg1\nAssistant: resp\nUser: Generate image of cat"` |
| Harmony `<\|start\|>user<\|message\|>...<\|end\|>` | Production UI (ui5) | `"<\|start\|>user<\|message\|>msg1<\|end\|>\n...\n<\|start\|>user<\|message\|>Generate image of cat<\|end\|>"` |

### Modified Files

```
packages/sdk-core/
├── src/utils/
│   └── image-intent-analyzer.ts        # +12 lines (extractLastUserMessage helper)
└── tests/unit/
    └── image-intent-analyzer.test.ts   # +50 lines (5 multi-turn tests)
```

### Execution Order

| Step | Sub-phase | Dependencies | Status |
|------|-----------|-------------|--------|
| 1 | 6.1 Multi-Turn Tests & Extraction Logic | Phase 5 (existing analyzer) | [x] |
| 2 | 6.2 Build & Pack v1.14.11 | 6.1 | [x] |

---

### Sub-phase 6.1: Multi-Turn Extraction Logic

**Goal**: Add `extractLastUserMessage()` helper to `image-intent-analyzer.ts` and update `analyzePromptForImageIntent()` to use it. Write tests first (TDD).

**Modified file**: `src/utils/image-intent-analyzer.ts` (+12 lines, new max 87 lines)
**Modified test file**: `tests/unit/image-intent-analyzer.test.ts` (+50 lines, new max 214 lines)

#### Tasks

**Tests (write first — RED):**
- [ ] Write 5 multi-turn prompt tests in new `describe('multi-turn prompt handling')` block
- [ ] Verify new tests FAIL (RED) while existing 26 tests still PASS

**Implementation (GREEN):**
- [ ] Implement `extractLastUserMessage(prompt): string` private helper
- [ ] Handle Harmony format: extract content from last `<|start|>user<|message|>...<|end|>`
- [ ] Handle `User: ...` format: extract text after last `\nUser: ` (or strip leading `User: `)
- [ ] Fallback: return prompt as-is if no multi-turn markers found
- [ ] Update `analyzePromptForImageIntent()`: call `extractLastUserMessage()` before trigger matching
- [ ] Use extracted `lastMessage` for trigger matching, size/steps extraction, and clean prompt
- [ ] Verify all 31 tests PASS (GREEN) — 26 existing + 5 new

**Multi-turn tests (5):**

| # | Prompt | Expected |
|---|--------|----------|
| 1 | `"User: Hello\nAssistant: Hi there\nUser: Generate an image of a cat"` | `isImageIntent: true`, `cleanPrompt: "a cat"` |
| 2 | `"User: Hello\nAssistant: Hi there\nUser: What is 2+2?"` | `isImageIntent: false` |
| 3 | `"<\|start\|>user<\|message\|>Hello<\|end\|>\n<\|start\|>assistant<\|channel\|>final<\|message\|>Hi<\|end\|>\n<\|start\|>user<\|message\|>draw a cat<\|end\|>"` | `isImageIntent: true`, `cleanPrompt: "a cat"` |
| 4 | `"User: Generate an image of a cat\nAssistant: Image generated successfully\nUser: Generate an image of a cat astronaut in 1024x1024"` | `isImageIntent: true`, `extractedOptions.size: "1024x1024"` |
| 5 | `"User: Hello\nAssistant: Hi\nUser: draw a sunset with 20 steps"` | `isImageIntent: true`, `extractedOptions.steps: 20`, `cleanPrompt: "a sunset"` |

**`extractLastUserMessage()` logic** (~12 lines):

```typescript
function extractLastUserMessage(prompt: string): string {
  // Harmony format: last <|start|>user<|message|>CONTENT<|end|>
  const harmonyMatches = [...prompt.matchAll(/<\|start\|>user<\|message\|>([\s\S]*?)<\|end\|>/g)];
  if (harmonyMatches.length > 0) return harmonyMatches[harmonyMatches.length - 1][1].trim();
  // "User: ..." format: last occurrence
  const userMatches = [...prompt.matchAll(/(?:^|\n)User:\s*([\s\S]*?)(?=\nAssistant:|\n<|$)/gi)];
  if (userMatches.length > 0) return userMatches[userMatches.length - 1][1].trim();
  return prompt;
}
```

**Reference Files:**
- `src/utils/image-intent-analyzer.ts` (current 75 lines — modify in place)
- `tests/unit/image-intent-analyzer.test.ts` (current 164 lines — append tests)

**Success Criteria:**
- [ ] All 31 tests pass (26 existing + 5 new)
- [ ] Existing 26 tests unchanged and still pass (no regressions)
- [ ] `src/utils/image-intent-analyzer.ts` is ≤ 87 lines
- [ ] `tests/unit/image-intent-analyzer.test.ts` is ≤ 214 lines

---

### Sub-phase 6.2: Build & Pack v1.14.11

**Goal**: Rebuild SDK, bump version, produce tarball.

**Line Budget**: 0 new source lines (version bump only)

#### Tasks
- [ ] Bump version in `packages/sdk-core/package.json` to `1.14.11`
- [ ] Build: `pnpm build:esm && pnpm build:cjs` — verify no build errors
- [ ] Run all image generation tests: `pnpm test --run tests/unit/image-intent-analyzer.test.ts tests/unit/image-generation-types.test.ts tests/unit/image-generation-errors.test.ts tests/unit/image-generation-billing.test.ts tests/unit/image-generation-rate-limiter.test.ts tests/unit/image-generation-capabilities.test.ts` — all pass
- [ ] Pack: `pnpm pack` — produces `fabstir-sdk-core-1.14.11.tgz`
- [ ] Notify via ntfy

**Success Criteria:**
- [ ] Build succeeds (ESM + CJS)
- [ ] All 75+ image generation tests pass
- [ ] Tarball v1.14.11 produced

---

### Verification (Phase 6)

1. Unit tests: `pnpm test --run tests/unit/image-intent-analyzer.test.ts` — 31 pass
2. Build: `pnpm build:esm && pnpm build:cjs`
3. Pack: `pnpm pack` (v1.14.11)
4. UI installs tarball + clears Next.js cache
5. Manual: First message "Generate an image of a cat" → auto-detected, image generated
6. Manual: Second message "Generate an image of a cat in 1024x1024" → auto-detected (NOT fake download link)
7. Manual: "What is in this image?" → NOT detected, goes to LLM (no false positive)
8. Manual: "Hello" → normal text inference

### File Summary — Phase 6

| File | Max Lines | Purpose | Sub-phase |
|------|-----------|---------|-----------|
| `src/utils/image-intent-analyzer.ts` | 87 (+12 from 75) | Add `extractLastUserMessage()` | 6.1 |
| `tests/unit/image-intent-analyzer.test.ts` | 214 (+50 from 164) | 5 multi-turn tests | 6.1 |
| `packages/sdk-core/package.json` | version bump | 1.14.10 → 1.14.11 | 6.2 |
| **Total modified source** | **≤ 12** | | |
| **Total new tests** | **≤ 50** | **5 test cases** | |
