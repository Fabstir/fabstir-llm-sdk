# Implementation Plan: Route Images via Encrypted WebSocket

## Overview

Replace the HTTP-based image processing pipeline (`/v1/describe-image`, `/v1/ocr`) with encrypted WebSocket image delivery. Images are sent inside the encrypted WebSocket payload alongside the user's prompt. The node (v8.15.3+) decrypts, processes images server-side via VLM sidecar (Qwen3-VL), and streams the response back. This provides end-to-end encryption for images (previously sent as plaintext HTTP).

## Status: Complete

**Implementation**: Image Chat via Encrypted WebSocket + VLM Token Display
**SDK Version**: 1.13.0
**Network**: Base Sepolia (Chain ID: 84532)
**Node Requirement**: v8.15.4+
**Source Documents**:
- Node developer specification (inline, see task description)
- `docs/platformless-ui/IMAGE_RAG_INTEGRATION.md` (old flow, being replaced)

### Phases Overview:
- [x] Phase 1: Types, Interface & Validation
- [x] Phase 2: Encrypted Payload Restructure
- [x] Phase 3: Remove HTTP Image Processing
- [x] Phase 4: Build, Test & Version Bump
- [x] Phase 5: VLM Token Display

---

## Summary of Changes

| Change | Impact | Scope |
|--------|--------|-------|
| Add `ImageAttachment`, `PromptOptions` types | Additive | `types/index.ts` |
| Update `sendPromptStreaming` signature | **BREAKING** | Interface + SessionManager |
| Encrypted payload → JSON object | **BREAKING** (node v8.15.3+ required) | `sendEncryptedMessage` |
| Plaintext path adds `images` field | Additive | `sendPromptStreaming` plaintext path |
| Remove `/v1/describe-image` HTTP call | **BREAKING** (RAG image upload) | HostAdapter |
| Remove `/v1/ocr` HTTP call | **BREAKING** (RAG image upload) | HostAdapter |
| DocumentManager rejects image uploads | **BREAKING** | DocumentManager |

### Encrypted Payload Format (New)

Previously: plain string (just the prompt)

Now: JSON object (always, even without images):
```json
{
  "prompt": "Describe what you see in the attached image",
  "images": [
    { "data": "<base64 without data:uri prefix>", "format": "png" }
  ],
  "model": "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf",
  "max_tokens": 4000,
  "temperature": 0.7,
  "stream": true
}
```

### API Surface Change

```typescript
// Before
sendPromptStreaming(sessionId: bigint, prompt: string, onToken?: (token: string) => void): Promise<string>;

// After
sendPromptStreaming(sessionId: bigint, prompt: string, onToken?: (token: string) => void, options?: PromptOptions): Promise<string>;
```

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Types, Interface & Validation

### Sub-phase 1.1: Add Image Types

**Goal**: Define `ImageAttachment`, `ImageFormat`, and `PromptOptions` types.

**Line Budget**: 20 lines new code

#### Tasks
- [ ] Write test: `ImageAttachment` has `data` (string) and `format` (ImageFormat) fields
- [ ] Write test: `PromptOptions` has optional `images` field
- [ ] Write test: `ImageFormat` accepts `'png' | 'jpeg' | 'webp' | 'gif'`
- [ ] Add `ImageFormat` type to `packages/sdk-core/src/types/index.ts`
- [ ] Add `ImageAttachment` interface to `packages/sdk-core/src/types/index.ts`
- [ ] Add `PromptOptions` interface to `packages/sdk-core/src/types/index.ts`
- [ ] Verify types exported from barrel (`src/index.ts`)

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (NEW, sub-phase 1.1 section, ~15 lines)

**Implementation Files:**
- `packages/sdk-core/src/types/index.ts` (MODIFY, +15 lines near line 119)

**Success Criteria:**
- [ ] Types compile correctly
- [ ] `PromptOptions.images` is optional
- [ ] Tests pass

---

### Sub-phase 1.2: Update ISessionManager Interface

**Goal**: Add `options?: PromptOptions` as 4th parameter to `sendPromptStreaming`.

**Line Budget**: 5 lines modified

#### Tasks
- [ ] Write test: `sendPromptStreaming` accepts 4th `options` parameter
- [ ] Write test: `sendPromptStreaming` works without 4th parameter (backward compat)
- [ ] Update `sendPromptStreaming` signature in `ISessionManager`
- [ ] Add import for `PromptOptions`

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (sub-phase 1.2 section, ~15 lines)

**Implementation Files:**
- `packages/sdk-core/src/interfaces/ISessionManager.ts` (MODIFY, +2 lines at line 35-39)

**Success Criteria:**
- [ ] Interface compiles
- [ ] Backward compatible (4th param optional)
- [ ] Tests pass

---

### Sub-phase 1.3: Image Validation Utility

**Goal**: Create `validateImageAttachments()` function for input validation before encryption.

**Line Budget**: 45 lines new file

#### Tasks
- [ ] Write test: accepts valid PNG image attachment
- [ ] Write test: accepts valid JPEG image attachment
- [ ] Write test: accepts valid WebP and GIF formats
- [ ] Write test: rejects `data:image/png;base64,...` prefix (must be raw base64)
- [ ] Write test: rejects unsupported format (e.g. `'bmp'`)
- [ ] Write test: rejects empty images array
- [ ] Write test: rejects non-string data field
- [ ] Write test: rejects image exceeding 10MB
- [ ] Implement `validateImageAttachments()` in new utility file
- [ ] Export from utility barrel if one exists

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (sub-phase 1.3 section, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/image-validation.ts` (NEW, max 45 lines)

**Success Criteria:**
- [ ] All 8 validation tests pass
- [ ] Throws `SDKError` with descriptive codes (`INVALID_IMAGE_DATA`, `INVALID_IMAGE_FORMAT`, `IMAGE_TOO_LARGE`)
- [ ] Rejects `data:uri` prefix with helpful message

---

## Phase 2: Encrypted Payload Restructure

### Sub-phase 2.1: Restructure `sendEncryptedMessage` Payload

**Goal**: Change encrypted payload from plain string to JSON object containing `{ prompt, model, max_tokens, temperature, stream, images? }`.

**Line Budget**: 30 lines modified in SessionManager

#### Tasks
- [ ] Write test: encrypted payload decrypts to valid JSON
- [ ] Write test: decrypted JSON contains `prompt`, `model`, `max_tokens`, `temperature`, `stream` fields
- [ ] Write test: decrypted JSON contains `images` array when images provided
- [ ] Write test: decrypted JSON omits `images` field when no images provided
- [ ] Write test: `images` entries have `data` and `format` fields only
- [ ] Write test: validation runs before encryption (invalid image throws, nothing sent)
- [ ] Update `sendEncryptedMessage` signature to add `images?: ImageAttachment[]` as 3rd param
- [ ] Build JSON payload from session state (`currentSession.model`, `LLM_MAX_TOKENS`)
- [ ] Add `images` to payload only when present and non-empty
- [ ] Call `validateImageAttachments()` before building payload
- [ ] `JSON.stringify(structuredPayload)` passed to `encryptionManager.encryptMessage()`
- [ ] WebSocket wrapper (type, session_id, id, payload, web_search fields) unchanged

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (sub-phase 2.1 section, ~60 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY `sendEncryptedMessage` at line 1647, ~30 lines changed)

**Key Code Reference:**
- `EncryptionManager.encryptMessage(sessionKey, string, index)` at `src/managers/EncryptionManager.ts:287` — takes string, we pass `JSON.stringify(payload)`
- `LLM_MAX_TOKENS` imported from `src/config/llm-config.ts`
- `currentSession.model` available from `this.sessions` (already accessed at line 1679)

**Success Criteria:**
- [ ] `encryptMessage` receives JSON string, not plain prompt
- [ ] All 6 tests pass
- [ ] WebSocket wrapper structure unchanged

---

### Sub-phase 2.2: Wire `sendPromptStreaming` to Pass Images

**Goal**: Thread `options?.images` from public API through to `sendEncryptedMessage` and plaintext path.

**Line Budget**: 20 lines modified in SessionManager

#### Tasks
- [ ] Write test: `sendPromptStreaming` with images passes them to encrypted message
- [ ] Write test: `sendPromptStreaming` without images works (no regression)
- [ ] Write test: plaintext path includes `images` in `request` object
- [ ] Write test: message metadata stores `imageCount` (not raw image data)
- [ ] Add `options?: PromptOptions` as 4th param to `sendPromptStreaming` (line 684)
- [ ] Pass `options?.images` to `sendEncryptedMessage()` at line 901 (streaming encrypted)
- [ ] Pass `options?.images` to `sendEncryptedMessage()` at line 1030 (non-streaming encrypted)
- [ ] Add `images` to plaintext `request` object at line 939 when present
- [ ] Store `imageCount` in user message metadata at line 1148

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (sub-phase 2.2 section, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, ~20 lines across lines 684, 901, 939, 1030, 1148)

**Success Criteria:**
- [ ] Images flow from public API to encrypted payload
- [ ] Plaintext path also supports images
- [ ] No images stored in S5 (only imageCount in metadata)
- [ ] All 4 tests pass

---

### Sub-phase 2.3: Edge Case Guards

**Goal**: Ensure REST-based methods reject image attachments with clear errors.

**Line Budget**: 10 lines modified

#### Tasks
- [ ] Write test: `streamResponse()` throws `IMAGES_NOT_SUPPORTED` when images provided
- [ ] Write test: `streamResponse()` continues to work without images
- [ ] Add `options?: PromptOptions` param to `streamResponse` signature (line 1991)
- [ ] Add guard: throw `SDKError` if `options?.images` provided

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (sub-phase 2.3 section, ~20 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY `streamResponse` at line 1991, +6 lines)
- `packages/sdk-core/src/interfaces/ISessionManager.ts` (MODIFY `streamResponse` signature, +1 line)

**Success Criteria:**
- [ ] Clear error directs users to `sendPromptStreaming()`
- [ ] No regression on non-image calls
- [ ] Tests pass

---

## Phase 3: Remove HTTP Image Processing

### Sub-phase 3.1: Remove Image Methods from HostAdapter

**Goal**: Delete `/v1/describe-image` and `/v1/ocr` HTTP call methods from HostAdapter.

**Line Budget**: 0 new lines (deletion only)

#### Tasks
- [ ] Delete `callOcrEndpoint()` method (lines 192-235)
- [ ] Delete `callDescribeEndpoint()` method (lines 245-287)
- [ ] Delete `processImage()` method (lines 296-335)
- [ ] Delete `combineImageText()` method (lines 341-349)
- [ ] Delete `createImageTimeoutSignal()` if only used by above methods
- [ ] Remove `ImageProcessingResult` import if no longer referenced
- [ ] Verify HostAdapter still compiles (embedding methods remain)

**Implementation Files:**
- `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts` (MODIFY, ~160 lines deleted)

**Success Criteria:**
- [ ] No `/v1/describe-image` or `/v1/ocr` references in HostAdapter
- [ ] Embedding methods (`embed`, `embedBatch`) unaffected
- [ ] TypeScript compiles

---

### Sub-phase 3.2: Update DocumentManager for Image Rejection

**Goal**: Replace image processing code path with a clear error directing users to WebSocket image chat.

**Line Budget**: 5 lines modified

#### Tasks
- [ ] Write test: `DocumentManager.processDocument()` throws for PNG file with descriptive message
- [ ] Write test: `DocumentManager.processDocument()` throws for JPEG file
- [ ] Write test: `DocumentManager.processDocument()` still works for text files (no regression)
- [ ] Replace image processing block (lines 252-268) with error throw
- [ ] Remove `HostAdapter` instanceof check
- [ ] Keep `isImageType()` import (still used for detection)

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` (sub-phase 3.2 section, ~25 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/DocumentManager.ts` (MODIFY lines 252-268, net ~-10 lines)

**Success Criteria:**
- [ ] Image uploads throw with message mentioning `sendPromptStreaming` and `options.images`
- [ ] Text/PDF document processing unaffected
- [ ] Tests pass

---

### Sub-phase 3.3: Remove ImageProcessingResult Type

**Goal**: Clean up unused type from removed pipeline.

**Line Budget**: 0 new lines (deletion only)

#### Tasks
- [ ] Delete `ImageProcessingResult` interface from `src/documents/types.ts` (lines 15-26)
- [ ] Verify no remaining references in source code
- [ ] Remove import from DocumentManager if present
- [ ] TypeScript compiles

**Implementation Files:**
- `packages/sdk-core/src/documents/types.ts` (MODIFY, ~12 lines deleted)
- `packages/sdk-core/src/managers/DocumentManager.ts` (MODIFY, remove import if needed)

**Success Criteria:**
- [ ] Type removed
- [ ] No dangling references
- [ ] Compiles clean

---

### Sub-phase 3.4: Delete Obsolete Test Files

**Goal**: Remove test files that test deleted functionality.

**Line Budget**: 0 (deletion only)

#### Tasks
- [ ] Delete `packages/sdk-core/tests/unit/host-adapter-image.test.ts`
- [ ] Delete `packages/sdk-core/tests/unit/document-manager-image.test.ts`
- [ ] Verify `packages/sdk-core/tests/unit/image-type-detection.test.ts` still passes (`isImageType()` still exists)
- [ ] Run full test suite — no failures from deleted files

**Files Deleted:**
- `packages/sdk-core/tests/unit/host-adapter-image.test.ts`
- `packages/sdk-core/tests/unit/document-manager-image.test.ts`

**Files Kept:**
- `packages/sdk-core/tests/unit/image-type-detection.test.ts` (tests `isImageType()`, still valid)

**Success Criteria:**
- [ ] Deleted test files no longer run
- [ ] Remaining tests pass
- [ ] No references to deleted methods in test suite

---

## Phase 4: Build, Test & Version Bump

### Sub-phase 4.1: Full Test Suite

**Goal**: All tests pass including new image chat tests.

**Line Budget**: 0 (no code changes)

#### Tasks
- [ ] Run `cd packages/sdk-core && pnpm test`
- [ ] Verify new tests pass: `SessionManager-image-chat.test.ts`
- [ ] Verify existing tests pass (no regressions)
- [ ] Verify `image-type-detection.test.ts` still passes
- [ ] Verify no references to `/v1/describe-image` or `/v1/ocr` in SDK source code

**Success Criteria:**
- [ ] All tests green
- [ ] Zero references to removed HTTP endpoints in source (docs OK)

---

### Sub-phase 4.2: Build SDK

**Goal**: Clean build of SDK with all changes.

**Line Budget**: 1 line (version bump)

#### Tasks
- [ ] Increment version in `packages/sdk-core/package.json`
- [ ] Run `pnpm build:esm && pnpm build:cjs`
- [ ] Verify build succeeds with no new errors
- [ ] Clear harness caches: `rm -rf apps/harness/.next apps/harness/node_modules/.cache`
- [ ] Run `pnpm install --force`

**Implementation Files:**
- `packages/sdk-core/package.json` (MODIFY, 1 line — version bump)

**Success Criteria:**
- [ ] Build succeeds
- [ ] dist/ files generated
- [ ] Version incremented

---

### Sub-phase 4.3: Notify Completion

**Goal**: Send notification on ntfy channel.

#### Tasks
- [ ] Send notification to `fabstir-remediation-pre-report719` channel

**Success Criteria:**
- [ ] Notification received

---

## Phase 5: VLM Token Display

### Context

Node v8.15.4 now sends `vlm_tokens` in `stream_end` WebSocket messages when images were
processed by the VLM sidecar (OCR + image description). The UI currently estimates tokens
via `Math.ceil((prompt.length + response.length) / 4)` — inaccurate. The host was paid
correctly (~0.05 ETH for ~3,000 tokens) but the UI showed only 397 estimated tokens.

**Node developer spec (stream_end v8.15.4):**
```json
{ "type": "stream_end", "id": "msg-123", "session_id": "69", "vlm_tokens": 2873 }
```

**Token flow:**
```
User sends image → VLM OCR (1,445) + VLM Describe (1,428) = 2,873 VLM tokens
                 → Main LLM generates response = 130 LLM tokens
                 → Total billed on-chain: 3,003 tokens
                 → stream_end: { vlm_tokens: 2873 }
                 → SDK sums: 130 (chunk count) + 2873 (stream_end) = 3,003
```

**Approach**: Add `onTokenUsage` callback to `PromptOptions` — backward compatible,
no change to `Promise<string>` return type of `sendPromptStreaming`.

**Token counting strategy:**
- **LLM tokens**: `data.tokens_used` from `stream_end` if available, else count of
  `encrypted_chunk`/`stream_chunk` messages (each chunk ≈ 1 token)
- **VLM tokens**: `data.vlm_tokens` from `stream_end` (0 if absent — no images processed)
- **Total**: `llmTokens + vlmTokens`

---

### Sub-phase 5.1: Add `TokenUsageInfo` Type & Extend `PromptOptions`

**Goal**: Define the token usage type and add `onTokenUsage` callback to `PromptOptions`.

**Line Budget**: 15 lines new in `types/index.ts`

#### Tasks
- [x] Write test: `TokenUsageInfo` has `llmTokens`, `vlmTokens`, `totalTokens` (number fields)
- [x] Write test: `PromptOptions.onTokenUsage` is optional callback accepting `TokenUsageInfo`
- [x] Add `TokenUsageInfo` interface to `packages/sdk-core/src/types/index.ts`
- [x] Extend `PromptOptions` with `onTokenUsage?: (usage: TokenUsageInfo) => void`
- [x] Verify type exported from barrel (`src/index.ts`)

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-vlm-tokens.test.ts` (NEW, sub-phase 5.1, ~20 lines)

**Implementation Files:**
- `packages/sdk-core/src/types/index.ts` (MODIFY, +12 lines after line 133)

**Success Criteria:**
- [x] Types compile correctly
- [x] `PromptOptions.onTokenUsage` is optional
- [x] Tests pass

---

### Sub-phase 5.2: Capture VLM Tokens in Encrypted Streaming Path

**Goal**: Parse `vlm_tokens` from `stream_end`, count chunks for LLM tokens, call
`onTokenUsage` callback, update `session.totalTokens`.

**Line Budget**: 15 lines modified in SessionManager (Path 1: lines 847–917)

#### Tasks
- [x] Write test: encrypted streaming — `onTokenUsage` called with `vlm_tokens` from `stream_end`
- [x] Write test: encrypted streaming — `llmTokens` equals chunk count when `tokens_used` absent
- [x] Write test: encrypted streaming — `session.totalTokens` updated after prompt
- [x] Write test: encrypted streaming — `onTokenUsage` not provided, no error (backward compat)
- [x] Add `chunkCount` variable, increment per `encrypted_chunk` (line ~851)
- [x] In `stream_end` handler (line ~883): extract `data.vlm_tokens` and `data.tokens_used`
- [x] Compute `TokenUsageInfo`, call `options?.onTokenUsage?.(usage)`, update `session.totalTokens`

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-vlm-tokens.test.ts` (sub-phase 5.2, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, ~15 lines at lines 847–888)

**Success Criteria:**
- [ ] `stream_end` with `vlm_tokens: 2873` → callback receives `{ llmTokens, vlmTokens: 2873, totalTokens }`
- [ ] Without `vlm_tokens` → `vlmTokens: 0`
- [ ] `session.totalTokens` incremented by `totalTokens`
- [ ] Tests pass

---

### Sub-phase 5.3: Capture VLM Tokens in Plaintext Streaming Path

**Goal**: Add `stream_end` handler to plaintext streaming `onMessage` to capture VLM tokens.

**Line Budget**: 12 lines modified in SessionManager (Path 2: lines 919–978)

#### Tasks
- [x] Write test: plaintext streaming — `onTokenUsage` called with `vlm_tokens` from `stream_end`
- [x] Write test: plaintext streaming — chunk count used as `llmTokens`
- [x] Add `chunkCount` variable, increment per `stream_chunk` (line ~923)
- [x] Add `stream_end` handler in `onMessage` callback (currently missing at lines 921–931)
- [x] Extract `data.vlm_tokens`, compute usage, call callback, update session

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-vlm-tokens.test.ts` (sub-phase 5.3, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, ~12 lines at lines 921–931)

**Success Criteria:**
- [ ] `stream_end` captured even though `sendMessage()` also handles it
- [ ] Token usage callback fires before promise resolves
- [ ] Tests pass

---

### Sub-phase 5.4: Capture VLM Tokens in Non-Streaming Paths

**Goal**: Handle token capture in encrypted non-streaming (Path 3) and plaintext
non-streaming (Path 4).

**Line Budget**: 25 lines modified in SessionManager

#### Tasks
- [x] Write test: encrypted non-streaming — `onTokenUsage` called from `stream_end`
- [x] Write test: plaintext non-streaming — `onTokenUsage` called with `tokens_used` from `response`
- [x] Path 3 (lines 1070–1137): add `chunkCount`, extract tokens from `stream_end` handler (line ~1130)
- [x] Path 4 (lines 1138–1182): register temporary `onMessage` handler before `sendMessage()` to capture `tokens_used` and `vlm_tokens` from `response`/`stream_end`
- [x] Both paths: call `options?.onTokenUsage?.(usage)`, update `session.totalTokens`

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-vlm-tokens.test.ts` (sub-phase 5.4, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, ~25 lines at lines 1096–1182)

**Success Criteria:**
- [ ] Both non-streaming paths report token usage
- [ ] `session.totalTokens` accumulates across multiple prompts
- [ ] Tests pass

---

### Sub-phase 5.5: Add `getLastTokenUsage()` Getter & Update Interface

**Goal**: Add `lastTokenUsage` to `SessionState` and expose via `getLastTokenUsage()` method.

**Line Budget**: 10 lines total across interface + implementation

#### Tasks
- [x] Write test: `getLastTokenUsage()` returns `undefined` before any prompt
- [x] Write test: `getLastTokenUsage()` returns last prompt's `TokenUsageInfo`
- [x] Add `lastTokenUsage?: TokenUsageInfo` to `SessionState` (line ~130)
- [x] Add `getLastTokenUsage(sessionId)` method to `SessionManager`
- [x] Add `getLastTokenUsage(sessionId)` to `ISessionManager` interface
- [x] Import `TokenUsageInfo` in `ISessionManager.ts`

**Test Files:**
- `packages/sdk-core/tests/managers/SessionManager-vlm-tokens.test.ts` (sub-phase 5.5, ~25 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +6 lines)
- `packages/sdk-core/src/interfaces/ISessionManager.ts` (MODIFY, +4 lines)

**Success Criteria:**
- [ ] Getter works
- [ ] Returns `undefined` for sessions without any prompt
- [ ] Tests pass

---

### Sub-phase 5.6: Update Test Harness UI

**Goal**: Replace token estimation in `chat-context-demo.tsx` with actual token data.

**Line Budget**: 15 lines modified in UI

#### Tasks
- [x] Replace `Math.ceil((fullPrompt.length + cleanedResponse.length) / 4)` with `onTokenUsage` callback
- [x] Pass `onTokenUsage` in `sendPromptStreaming` options
- [x] Use `capturedTokenUsage.totalTokens` for `addMessage` call
- [x] Show VLM breakdown when `vlmTokens > 0` (e.g. "2,873 VLM + 130 LLM = 3,003 total")

**Implementation Files:**
- `apps/harness/pages/chat-context-demo.tsx` (MODIFY, ~15 lines at lines 1277–1328)

**Success Criteria:**
- [ ] UI displays actual token counts from node
- [ ] VLM token breakdown shown when images were processed
- [ ] No regression for text-only prompts

---

### Sub-phase 5.7: Build, Test & Version Bump

**Goal**: Version bump, clean build, full test suite green.

**Line Budget**: 1 line (version bump)

#### Tasks
- [x] Increment version in `packages/sdk-core/package.json` to 1.13.0
- [x] Run `pnpm test packages/sdk-core/tests/managers/SessionManager-vlm-tokens.test.ts` — all pass (13/13)
- [x] Run `pnpm test packages/sdk-core/tests/managers/SessionManager-image-chat.test.ts` — no regressions (28/28)
- [x] Run `cd packages/sdk-core && pnpm build`
- [x] Clear caches: `rm -rf apps/harness/.next apps/harness/node_modules/.cache`
- [x] Run `pnpm install --force`
- [x] Send notification to `fabstir-remediation-pre-report719`

**Implementation Files:**
- `packages/sdk-core/package.json` (MODIFY, 1 line)

**Success Criteria:**
- [x] All tests green
- [x] Build succeeds
- [x] Version 1.13.0

---

### Phase 5 File Summary

| Sub-phase | File | Change Type | Lines |
|-----------|------|-------------|-------|
| 5.1 | `src/types/index.ts` | MODIFY | +12 |
| 5.2 | `src/managers/SessionManager.ts` | MODIFY | ~15 |
| 5.3 | `src/managers/SessionManager.ts` | MODIFY | ~12 |
| 5.4 | `src/managers/SessionManager.ts` | MODIFY | ~25 |
| 5.5 | `src/managers/SessionManager.ts` + interface | MODIFY | ~10 |
| 5.6 | `apps/harness/pages/chat-context-demo.tsx` | MODIFY | ~15 |
| 5.7 | `package.json` | MODIFY | 1 |
| ALL | `tests/managers/SessionManager-vlm-tokens.test.ts` | NEW | ~185 |

**Total**: ~90 implementation lines + ~185 test lines = ~275 lines

---

## Verification Checklist

### Image WebSocket Chat
- [ ] `sendPromptStreaming(id, prompt, onToken, { images: [...] })` encrypts JSON payload
- [ ] Decrypted payload contains `{ prompt, model, max_tokens, temperature, stream, images }`
- [ ] Without images: decrypted payload contains `{ prompt, model, max_tokens, temperature, stream }` (no images key)
- [ ] Plaintext path includes images in `request` object
- [ ] `validateImageAttachments()` rejects `data:uri`, invalid formats, oversized images

### HTTP Image Processing Removed
- [ ] `HostAdapter` has no `processImage`, `callOcrEndpoint`, `callDescribeEndpoint` methods
- [ ] `DocumentManager.processDocument()` throws for image files with helpful error
- [ ] `ImageProcessingResult` type deleted
- [ ] Zero references to `/v1/describe-image` or `/v1/ocr` in SDK source

### VLM Token Display
- [x] `stream_end` with `vlm_tokens` → `onTokenUsage` callback receives correct `TokenUsageInfo`
- [x] Without `vlm_tokens` → `vlmTokens: 0`, `llmTokens` = chunk count
- [x] `session.totalTokens` accumulates across prompts
- [x] `getLastTokenUsage()` returns last prompt's usage
- [x] UI displays actual tokens instead of estimation
- [x] VLM breakdown shown when `vlmTokens > 0`

### Edge Cases
- [ ] `streamResponse()` throws `IMAGES_NOT_SUPPORTED` for images
- [ ] `sendPromptStreaming` without options works (backward compat)
- [ ] Message metadata stores `imageCount`, not raw image data

---

## File Summary

| Phase | File | Change Type | Lines |
|-------|------|-------------|-------|
| 1.1 | `src/types/index.ts` | MODIFY | +15 |
| 1.2 | `src/interfaces/ISessionManager.ts` | MODIFY | +2 |
| 1.3 | `src/utils/image-validation.ts` | NEW | max 45 |
| 2.1 | `src/managers/SessionManager.ts` | MODIFY | ~30 changed |
| 2.2 | `src/managers/SessionManager.ts` | MODIFY | ~20 changed |
| 2.3 | `src/managers/SessionManager.ts` + interface | MODIFY | ~7 |
| 3.1 | `src/embeddings/adapters/HostAdapter.ts` | MODIFY | ~160 deleted |
| 3.2 | `src/managers/DocumentManager.ts` | MODIFY | ~-10 net |
| 3.3 | `src/documents/types.ts` | MODIFY | ~12 deleted |
| 3.4 | `tests/unit/host-adapter-image.test.ts` | DELETE | — |
| 3.4 | `tests/unit/document-manager-image.test.ts` | DELETE | — |
| 4.2 | `package.json` | MODIFY | 1 |
| ALL | `tests/managers/SessionManager-image-chat.test.ts` | NEW | ~235 |

**Total New Lines**: ~60 implementation + ~235 test = ~295 lines
**Total Deleted Lines**: ~170+ lines (HostAdapter methods, types, test files)
**Net Change**: Roughly net-negative line count

---

## Notes

- Pre-MVP: No backward compatibility needed. Breaking changes are acceptable.
- Node v8.15.3+ is required — node developer will implement server-side VLM processing.
- The plaintext path already sends structured JSON (`request: { model, prompt, ... }`). This change brings the encrypted path to parity.
- In the encrypted path, the *original* prompt (not RAG-augmented) is sent because the node does RAG injection server-side using the `vectorDatabase` config from session init.
- `isImageType()` in `documents/extractors.ts` is kept — used by DocumentManager to detect and reject image uploads.
