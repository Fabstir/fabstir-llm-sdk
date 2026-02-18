# Implementation Plan: OpenAI-Compatible API Bridge

## Overview

Create `@fabstir/openai-bridge` — a separate package that exposes Fabstir's decentralised AI infrastructure via OpenAI-compatible API endpoints. This enables any OpenAI SDK client (Cursor, Continue, LiteLLM, LangChain, custom apps) to use Fabstir hosts for text inference, tool use, vision, and image generation without modification.

```
OpenAI SDK Client (Cursor, Continue, custom app)
  → POST /v1/chat/completions  (text, tools, vision)
  → POST /v1/images/generations (DALL-E compatible)
  ↓
OpenAI Bridge (HTTP server, port 3457)
  → Converts OpenAI format → ChatML
  → SessionBridge → FabstirSDKCore → Encrypted WebSocket → Host Node
  ← Host model tokens → ToolCallParser → ThinkStripper
  ← Converts to OpenAI SSE format → Client
```

## Status: Complete (All 7 Phases)

**Implementation**: OpenAI-Compatible API Bridge
**Package**: `@fabstir/openai-bridge`
**Network**: Base Sepolia (Chain ID: 84532)
**Prerequisite**: Working `@fabstir/claude-bridge` (reference implementation), `@fabstir/sdk-core` v1.14.11+ with image generation support
**Port**: 3457 (claude-bridge uses 3456)

### Phases Overview:
- [x] Phase 1: Package Scaffold, Types & Config
- [x] Phase 2: Shared Utils (copy + adapt from claude-bridge)
- [x] Phase 3: OpenAI Message Converter
- [x] Phase 4: OpenAI SSE Builder
- [x] Phase 5: Chat Completions Handler
- [x] Phase 6: Image Generation Handler
- [x] Phase 7: Server, CLI & Integration Tests

---

## Summary of Changes

| Aspect | Claude Bridge (existing) | OpenAI Bridge (new) |
|--------|--------------------------|---------------------|
| API format | Anthropic Messages API | OpenAI Chat Completions API |
| Chat endpoint | `POST /v1/messages` | `POST /v1/chat/completions` |
| Image endpoint | (none) | `POST /v1/images/generations` |
| Streaming format | `event: content_block_delta` | `data: {"choices":[{"delta":{"content":"..."}}]}` |
| Tool format (output) | `tool_use` content blocks | `tool_calls[].function` in delta |
| Tool results (input) | `tool_result` content block | message with `role: "tool"` + `tool_call_id` |
| System prompt | Separate `system` field | `role: "system"` message |
| Image input | `type: "image"` with base64 | `type: "image_url"` with URL or base64 |
| Stream terminator | `event: message_stop` | `data: [DONE]` |
| Package | `@fabstir/claude-bridge` | `@fabstir/openai-bridge` |
| Port | 3456 | 3457 |

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Separate package | Yes | No risk to working claude-bridge; independent versioning |
| Code reuse strategy | Copy + adapt shared modules | SessionBridge, ToolCallParser, ThinkStripper are model-agnostic |
| Image gen response | Always `b64_json` | Fabstir returns ephemeral base64; no persistent URL storage — more privacy-preserving |
| Quality → steps mapping | "standard"→4, "hd"→20 | Maps OpenAI quality tiers to FLUX.2 inference steps |
| `n > 1` images | Sequential loop | FLUX.2 generates one image at a time |
| Tool format (model output) | Same `<tool_call>` XML | Host model uses GLM-4.7 native format regardless of client API |

### Reuse from Claude Bridge

| Component | Claude Bridge Source | Reuse | Changes Needed |
|-----------|---------------------|-------|----------------|
| SessionBridge | `src/session-bridge.ts` (126 lines) | Copy + adapt | Minor: different default config |
| ToolCallParser | `src/tool-parser.ts` (95 lines) | Copy as-is | None — model-agnostic |
| ThinkStripper | `src/handler.ts` (extracted) | Extract + copy | Extract into standalone module (~30 lines) |
| Config pattern | `src/config.ts` (76 lines) | Adapt | Different port, env var prefix |
| Server pattern | `src/server.ts` (99 lines) | New (follow pattern) | Different routes, error format |
| Converter | `src/converter.ts` (109 lines) | Reference only | Completely new logic |
| SSE builder | `src/sse.ts` (90 lines) | Reference only | Completely new format |
| Handler | `src/handler.ts` (284 lines) | Reference only | New dispatch logic |

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
packages/openai-bridge/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── bin/openai-bridge                     # CLI entry point shebang
├── src/
│   ├── index.ts                          # Commander.js CLI (~60 lines)
│   ├── server.ts                         # HTTP server + routing (~110 lines)
│   ├── config.ts                         # Configuration + env vars (~80 lines)
│   ├── types.ts                          # OpenAI API TypeScript interfaces (~140 lines)
│   ├── session-bridge.ts                 # SDK integration — adapted from claude-bridge (~130 lines)
│   ├── tool-parser.ts                    # GLM tool XML parser — copied from claude-bridge (~95 lines)
│   ├── think-stripper.ts                 # <think> block removal — extracted from claude-bridge (~35 lines)
│   ├── openai-converter.ts              # OpenAI messages → ChatML (~120 lines)
│   ├── openai-sse.ts                    # OpenAI streaming event builders (~80 lines)
│   ├── openai-handler.ts               # /v1/chat/completions handler (~200 lines)
│   └── image-handler.ts                # /v1/images/generations handler (~100 lines)
└── tests/
    ├── types.test.ts                     # Type shape tests (~100 lines)
    ├── config.test.ts                    # Config validation tests (~80 lines)
    ├── tool-parser.test.ts              # Tool parser tests — adapted (~140 lines)
    ├── think-stripper.test.ts           # Think block tests (~60 lines)
    ├── openai-converter.test.ts         # Converter tests (~200 lines)
    ├── openai-sse.test.ts              # SSE builder tests (~120 lines)
    ├── openai-handler.test.ts          # Handler tests (~250 lines)
    ├── image-handler.test.ts           # Image gen tests (~150 lines)
    ├── server.test.ts                   # Server routing tests (~120 lines)
    └── integration/
        └── bridge-flow.test.ts          # End-to-end flows (~200 lines)
```

---

## Phase 1: Package Scaffold, Types & Config

### Sub-phase 1.1: Package Scaffold

**Goal**: Create the package directory with build tooling, dependencies, and empty entry point.

**Line Budget**: `package.json` (~50 lines), `tsconfig.json` (~20 lines), `vitest.config.ts` (~10 lines)

#### Tasks
- [x] Create `packages/openai-bridge/` directory
- [x] Create `package.json` with name `@fabstir/openai-bridge`, version `0.1.0`
- [x] Dependencies: `commander`, `@fabstir/sdk-core` (peer), `ethers` (peer)
- [x] Dev dependencies: `vitest`, `typescript`, `esbuild`, `@types/node`
- [x] Scripts: `build`, `test`, `dev`
- [x] Create `tsconfig.json` extending from root or standalone (target ES2020, strict)
- [x] Create `vitest.config.ts` with Node environment
- [x] Create `bin/openai-bridge` shebang file (2 lines)
- [x] Create empty `src/index.ts` placeholder
- [x] Verify `pnpm install` succeeds in workspace
- [x] Verify `pnpm test --run` succeeds (no tests yet, exits clean)

**Reference Files:**
- `packages/claude-bridge/package.json` (structure template)
- `packages/claude-bridge/tsconfig.json` (compiler options)
- `packages/claude-bridge/vitest.config.ts` (test config)

**Success Criteria:**
- [x] `pnpm install` resolves all dependencies
- [x] `pnpm test --run` exits cleanly
- [x] TypeScript compiles empty entry point

---

### Sub-phase 1.2: OpenAI Types

**Goal**: Define TypeScript interfaces for OpenAI Chat Completions API and Images API request/response shapes.

**Line Budget**: 140 lines (`src/types.ts`)

#### Tasks
- [x] Define `OpenAIChatMessage` interface: `role, content, name?, tool_calls?, tool_call_id?`
- [x] Define `OpenAIContentPart` union: `{ type: 'text', text } | { type: 'image_url', image_url: { url, detail? } }`
- [x] Define `OpenAIToolCall` interface: `{ id, type: 'function', function: { name, arguments } }`
- [x] Define `OpenAITool` interface: `{ type: 'function', function: { name, description, parameters } }`
- [x] Define `OpenAIChatRequest` interface: `model, messages, tools?, max_tokens?, temperature?, top_p?, stream?, stop?, tool_choice?`
- [x] Define `OpenAIChatCompletionChunk` interface (streaming): `id, object, created, model, choices[]` with `delta, index, finish_reason`
- [x] Define `OpenAIChatCompletion` interface (non-streaming): `id, object, created, model, choices[], usage`
- [x] Define `OpenAIChoice` interface: `index, message, finish_reason`
- [x] Define `OpenAIUsage` interface: `prompt_tokens, completion_tokens, total_tokens`
- [x] Define `OpenAIImageRequest` interface: `model?, prompt, n?, size?, quality?, style?, response_format?`
- [x] Define `OpenAIImageResponse` interface: `created, data: { b64_json?, url?, revised_prompt? }[]`
- [x] Define `OpenAIErrorResponse` interface: `error: { message, type, param?, code? }`
- [x] Define `OPENAI_FINISH_REASONS` const: `{ STOP: 'stop', TOOL_CALLS: 'tool_calls', LENGTH: 'length' }`
- [x] Write 12 tests in `tests/types.test.ts`
- [x] Verify all tests pass

**Test File**: `tests/types.test.ts` (~100 lines)

**Tests (12):**
1. [ ] `OpenAIChatRequest accepts minimal request (model + messages)`
2. [ ] `OpenAIChatRequest accepts full request with tools and streaming`
3. [ ] `OpenAIChatMessage accepts string content`
4. [ ] `OpenAIChatMessage accepts content parts array (text + image_url)`
5. [ ] `OpenAIChatMessage accepts tool_calls array`
6. [ ] `OpenAIChatMessage accepts tool role with tool_call_id`
7. [ ] `OpenAIImageRequest accepts minimal request (prompt only)`
8. [ ] `OpenAIImageRequest accepts full request (size, quality, n)`
9. [ ] `OpenAIImageResponse has correct shape with b64_json`
10. [ ] `OpenAIChatCompletionChunk has choices with delta`
11. [ ] `OpenAIChatCompletion has choices with message and usage`
12. [ ] `OpenAIErrorResponse has error with message and type`

**Reference Files:**
- `packages/claude-bridge/src/types.ts` (pattern for Anthropic types)

**Success Criteria:**
- [x] All 12 type tests pass
- [x] TypeScript compilation succeeds
- [x] `src/types.ts` is ≤ 140 lines

---

### Sub-phase 1.3: Configuration

**Goal**: Bridge configuration with CLI flag + environment variable + defaults pattern.

**Line Budget**: 80 lines (`src/config.ts`)

#### Tasks
- [x] Define `OpenAIBridgeConfig` interface: `port, privateKey, rpcUrl?, hostAddress?, modelName, chainId, depositAmount, pricePerToken, proofInterval, duration, apiKey?, localhostOverride?`
- [x] Implement `validateConfig(partial): OpenAIBridgeConfig` — merge CLI args → env vars → defaults
- [x] Environment variable prefix: `OPENAI_BRIDGE_*` (e.g. `OPENAI_BRIDGE_PRIVATE_KEY`, `OPENAI_BRIDGE_MODEL`)
- [x] Default port: `3457` (claude-bridge uses 3456)
- [x] Default chainId: `84532` (Base Sepolia)
- [x] Default depositAmount: `'0.0002'`
- [x] Default pricePerToken: `5000`
- [x] Default proofInterval: `100`
- [x] Default duration: `86400`
- [x] Throw on missing `privateKey`
- [x] Throw on missing `modelName`
- [x] Write 8 tests in `tests/config.test.ts`
- [x] Verify all tests pass

**Test File**: `tests/config.test.ts` (~80 lines)

**Tests (8):**
1. [ ] `validates with minimal required fields (privateKey + modelName)`
2. [ ] `applies default port 3457`
3. [ ] `applies default chainId 84532`
4. [ ] `applies default depositAmount '0.0002'`
5. [ ] `throws on missing privateKey`
6. [ ] `throws on missing modelName`
7. [ ] `reads from OPENAI_BRIDGE_* env vars`
8. [ ] `CLI args override env vars`

**Reference Files:**
- `packages/claude-bridge/src/config.ts` (exact pattern — adapt prefix and port)

**Success Criteria:**
- [x] All 8 config tests pass
- [x] `src/config.ts` is ≤ 80 lines

---

## Phase 2: Shared Utils (Copy + Adapt from Claude Bridge)

### Sub-phase 2.1: Tool Call Parser

**Goal**: Copy the GLM-4.7 `<tool_call>` XML parser from claude-bridge. This is model-agnostic — both bridges parse the same model output format.

**Line Budget**: 95 lines (`src/tool-parser.ts`) — direct copy

#### Tasks
- [x] Copy `packages/claude-bridge/src/tool-parser.ts` → `packages/openai-bridge/src/tool-parser.ts`
- [x] Verify no claude-bridge-specific imports (file is self-contained)
- [x] Copy and adapt tests from `packages/claude-bridge/tests/tool-parser.test.ts`
- [x] Write 14 tests in `tests/tool-parser.test.ts`
- [x] Verify all tests pass

**Test File**: `tests/tool-parser.test.ts` (~140 lines)

**Tests (14):**
1. [ ] `emits text event for plain text`
2. [ ] `emits tool_call event for complete tool call`
3. [ ] `parses tool name correctly`
4. [ ] `parses single argument`
5. [ ] `parses multiple arguments`
6. [ ] `coerces boolean string 'true' to boolean`
7. [ ] `coerces boolean string 'false' to boolean`
8. [ ] `coerces numeric string to number`
9. [ ] `handles JSON object in arg_value`
10. [ ] `handles tool call split across multiple tokens`
11. [ ] `handles partial tag at buffer boundary`
12. [ ] `emits text before tool call`
13. [ ] `emits text after tool call`
14. [ ] `flush() emits remaining buffered text`

**Reference Files:**
- `packages/claude-bridge/src/tool-parser.ts` (copy source)
- `packages/claude-bridge/tests/tool-parser.test.ts` (test source)

**Success Criteria:**
- [x] All 14 tool parser tests pass
- [x] `src/tool-parser.ts` is ≤ 95 lines
- [x] Byte-for-byte identical logic to claude-bridge version

---

### Sub-phase 2.2: Think Stripper

**Goal**: Extract `<think>` block stripping into a standalone module. In claude-bridge this is inline in handler.ts; here we make it a reusable utility.

**Line Budget**: 35 lines (`src/think-stripper.ts`)

#### Tasks
- [x] Implement `createThinkStripper(): (token: string) => string | null` — streaming mode
  - Returns `null` while inside `<think>` block (suppress output)
  - Returns cleaned text once past `</think>`
  - Early detection: if first token doesn't start with `<think`, pass through immediately
  - Buffer up to 8000 chars for detection window
- [x] Implement `stripThinkFromText(text: string): string` — non-streaming mode
  - Find first `</think>`, return everything after it
  - If no think block, return text unchanged
- [x] Write 8 tests in `tests/think-stripper.test.ts`
- [x] Verify all tests pass

**Test File**: `tests/think-stripper.test.ts` (~60 lines)

**Tests (8):**
1. [ ] `streaming: passes through text without think tags`
2. [ ] `streaming: strips <think>reasoning</think> prefix`
3. [ ] `streaming: returns null for tokens inside think block`
4. [ ] `streaming: returns text after </think> close`
5. [ ] `streaming: early detection skips non-think content immediately`
6. [ ] `non-streaming: strips think block from complete text`
7. [ ] `non-streaming: returns unchanged text without think block`
8. [ ] `non-streaming: handles empty string`

**Reference Files:**
- `packages/claude-bridge/src/handler.ts:18-58` (createThinkStripper inline)
- `packages/claude-bridge/src/handler.ts:60-70` (stripThinkFromText inline)

**Success Criteria:**
- [x] All 8 think stripper tests pass
- [x] `src/think-stripper.ts` is ≤ 35 lines

---

### Sub-phase 2.3: Session Bridge

**Goal**: Copy and adapt the SDK integration layer from claude-bridge. Handles session lifecycle, request queueing, auto-recovery.

**Line Budget**: 130 lines (`src/session-bridge.ts`)

#### Tasks
- [x] Copy `packages/claude-bridge/src/session-bridge.ts` → `packages/openai-bridge/src/session-bridge.ts`
- [x] Update imports: use `OpenAIBridgeConfig` instead of `BridgeConfig`
- [x] Keep all SDK lifecycle logic: `initialize()`, `ensureSession()`, `sendPrompt()`, `shutdown()`
- [x] Keep queue-based serialisation pattern
- [x] Keep auto-recovery on SESSION_NOT_FOUND/SESSION_NOT_ACTIVE
- [x] Keep localhost override for Docker
- [x] Add `getSessionManager()` accessor (needed for image generation handler)
- [x] Add `getSessionId()` accessor (needed for image generation handler)
- [x] Write 10 tests in `tests/session-bridge.test.ts` (adapt from claude-bridge)
- [x] Verify all tests pass

**Test File**: `tests/session-bridge.test.ts` (~130 lines)

**Tests (10):**
1. [ ] `initialize() creates SDK and authenticates`
2. [ ] `ensureSession() starts session on first call`
3. [ ] `ensureSession() returns cached sessionId on subsequent calls`
4. [ ] `sendPrompt() calls sessionManager.sendPromptStreaming()`
5. [ ] `sendPrompt() with onToken callback streams tokens`
6. [ ] `sendPrompt() without callback returns complete response`
7. [ ] `auto-recovery: clears session on SESSION_NOT_FOUND and retries`
8. [ ] `queue: serialises concurrent requests`
9. [ ] `shutdown() ends session cleanly`
10. [ ] `getSessionManager() returns manager after initialisation`

**Reference Files:**
- `packages/claude-bridge/src/session-bridge.ts` (copy source)
- `packages/claude-bridge/tests/session-bridge.test.ts` (test source)

**Success Criteria:**
- [x] All 10 session bridge tests pass
- [x] `src/session-bridge.ts` is ≤ 130 lines

---

## Phase 3: OpenAI Message Converter

### Sub-phase 3.1: OpenAI Converter

**Goal**: Convert OpenAI Chat Completions messages to ChatML format for the host model. This is the core translation layer — completely new logic (not copied from claude-bridge).

**Line Budget**: 120 lines (`src/openai-converter.ts`)

#### Tasks

**Message conversion:**
- [x] Implement `convertOpenAIMessages(messages, tools?): { prompt: string, images: ImageAttachment[] }`
- [x] Handle `role: "system"` → `<|im_start|>system\n{content}\n<|im_end|>`
- [x] Handle `role: "user"` with string content → `<|im_start|>user\n{content}\n<|im_end|>`
- [x] Handle `role: "user"` with content parts array → extract text, extract images
- [x] Handle `role: "assistant"` with string content → `<|im_start|>assistant\n{content}\n<|im_end|>`
- [x] Handle `role: "assistant"` with `tool_calls[]` → serialise as tool output in ChatML
- [x] Handle `role: "tool"` with `tool_call_id` → `<|im_start|>observation\n{content}\n<|im_end|>`
- [x] Append final `<|im_start|>assistant\n` to prompt model response

**Image extraction:**
- [x] Extract `image_url` content parts from user messages
- [x] Handle base64 data URLs: `data:image/png;base64,...` → `ImageAttachment`
- [x] Handle HTTPS URLs: fetch and convert to base64 (or pass URL through if model supports it)
- [x] Return `ImageAttachment[]` alongside prompt

**Tool injection:**
- [x] Format `tools[]` as text at END of system prompt (recency bias for small models)
- [x] Cap system prompt at 1000 chars (same strategy as claude-bridge)
- [x] Include `<tool_call>` format instructions for the model

**Utility:**
- [x] Implement `estimateInputTokens(prompt): number` — `Math.ceil(prompt.length / 4)`

**Tests**: Write 16 tests in `tests/openai-converter.test.ts`

**Test File**: `tests/openai-converter.test.ts` (~200 lines)

**Tests (16):**
1. [ ] `converts single user message to ChatML`
2. [ ] `converts system + user + assistant multi-turn`
3. [ ] `handles system message as first message`
4. [ ] `handles string content in user message`
5. [ ] `handles content parts array in user message`
6. [ ] `extracts image_url from content parts to ImageAttachment[]`
7. [ ] `handles base64 data URL in image_url`
8. [ ] `converts assistant message with tool_calls to ChatML`
9. [ ] `converts tool role message to observation block`
10. [ ] `appends final assistant prompt tag`
11. [ ] `injects tool definitions at end of system prompt`
12. [ ] `caps system prompt at 1000 chars`
13. [ ] `includes <tool_call> format instructions when tools provided`
14. [ ] `handles empty messages array (returns minimal prompt)`
15. [ ] `estimateInputTokens returns length/4`
16. [ ] `handles mixed text and image content parts`

**Reference Files:**
- `packages/claude-bridge/src/converter.ts` (ChatML pattern to follow, different input format)

**Success Criteria:**
- [x] All 16 converter tests pass
- [x] `src/openai-converter.ts` is ≤ 120 lines

---

## Phase 4: OpenAI SSE Builder

### Sub-phase 4.1: OpenAI SSE Events

**Goal**: Build OpenAI-format Server-Sent Events for streaming chat completions. Completely new format (not Anthropic content blocks).

**Line Budget**: 80 lines (`src/openai-sse.ts`)

#### Tasks
- [x] Implement `generateMessageId(): string` — returns `chatcmpl-{random}`
- [x] Implement `buildChatCompletionChunk(id, model, delta, finishReason?, index?): string`
  - Format: `data: {"id":"...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{...},"finish_reason":null}]}\n\n`
- [x] Implement `buildRoleDelta(id, model): string` — first chunk with `delta: { role: "assistant" }`
- [x] Implement `buildContentDelta(id, model, content): string` — text chunk with `delta: { content: "..." }`
- [x] Implement `buildToolCallDelta(id, model, toolCallIndex, toolCallId, functionName?, argumentChunk?): string`
  - First call: include `id`, `type: "function"`, `function: { name }` in delta
  - Subsequent: include `function: { arguments: "..." }` only
- [x] Implement `buildFinishDelta(id, model, finishReason): string` — `delta: {}` with `finish_reason`
- [x] Implement `buildDoneEvent(): string` — `data: [DONE]\n\n`
- [x] Write 10 tests in `tests/openai-sse.test.ts`
- [x] Verify all tests pass

**Test File**: `tests/openai-sse.test.ts` (~120 lines)

**Tests (10):**
1. [ ] `buildRoleDelta emits delta with role: "assistant"`
2. [ ] `buildContentDelta emits delta with content string`
3. [ ] `buildContentDelta includes correct id, model, created timestamp`
4. [ ] `buildToolCallDelta first call includes id, type, function name`
5. [ ] `buildToolCallDelta subsequent calls include only arguments chunk`
6. [ ] `buildFinishDelta emits finish_reason: "stop" for text completion`
7. [ ] `buildFinishDelta emits finish_reason: "tool_calls" for tool use`
8. [ ] `buildDoneEvent returns "data: [DONE]" line`
9. [ ] `generateMessageId starts with "chatcmpl-"`
10. [ ] `all events end with double newline`

**Reference Files:**
- `packages/claude-bridge/src/sse.ts` (builder pattern, different format)

**Success Criteria:**
- [x] All 10 SSE tests pass
- [x] `src/openai-sse.ts` is ≤ 80 lines
- [x] Output parseable by OpenAI SDK client

---

## Phase 5: Chat Completions Handler

### Sub-phase 5.1: Streaming Chat Handler

**Goal**: Handle `POST /v1/chat/completions` with `stream: true`. Convert request, send to host, stream response tokens as OpenAI SSE events.

**Line Budget**: 130 lines (streaming portion of `src/openai-handler.ts`)

#### Tasks

**Request validation:**
- [x] Validate `messages` array is present and non-empty
- [x] Validate `model` field is present
- [x] Return OpenAI-format error `{ error: { message, type: "invalid_request_error" } }` on validation failure

**Streaming flow:**
- [x] Call `convertOpenAIMessages(messages, tools)` → get ChatML prompt + images
- [x] Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- [x] Emit initial role delta: `buildRoleDelta(msgId, model)`
- [x] Call `bridge.sendPrompt(prompt, onToken, { images })` with streaming callback
- [x] For each token:
  - Run through `createThinkStripper()`
  - If tools defined: feed through `ToolCallParser`
  - For `text` events: emit `buildContentDelta(msgId, model, text)`
  - For `tool_call` events: emit `buildToolCallDelta(...)` with function name + arguments
- [x] After stream ends: emit `buildFinishDelta(msgId, model, finishReason)`
- [x] Emit `buildDoneEvent()`
- [x] End response

**Error handling:**
- [x] Catch errors during streaming, emit SSE error event
- [x] Return 500 with OpenAI error format for pre-stream failures

**Tests**: Write 10 tests in `tests/openai-handler.test.ts` (streaming section)

**Tests (10):**
1. [ ] `streaming: returns text/event-stream content type`
2. [ ] `streaming: first event has delta with role: "assistant"`
3. [ ] `streaming: text tokens emit content deltas`
4. [ ] `streaming: final event has finish_reason: "stop"`
5. [ ] `streaming: ends with data: [DONE]`
6. [ ] `streaming: tool_call parsed and emitted as tool_calls delta`
7. [ ] `streaming: tool use sets finish_reason: "tool_calls"`
8. [ ] `streaming: think blocks stripped from output`
9. [ ] `streaming: images extracted from content parts and passed to bridge`
10. [ ] `streaming: validation error returns 400 with OpenAI error format`

**Reference Files:**
- `packages/claude-bridge/src/handler.ts:72-180` (streaming pattern — adapt for OpenAI format)

**Success Criteria:**
- [x] All 10 streaming tests pass
- [x] `src/openai-handler.ts` streaming portion is ≤ 130 lines

---

### Sub-phase 5.2: Non-Streaming Chat Handler

**Goal**: Handle `POST /v1/chat/completions` with `stream: false` (or omitted). Return complete JSON response.

**Line Budget**: +70 lines added to `src/openai-handler.ts` (total ≤ 200 lines)

#### Tasks

**Non-streaming flow:**
- [x] Call `convertOpenAIMessages(messages, tools)` → get ChatML prompt + images
- [x] Call `bridge.sendPrompt(prompt, undefined, { images })` — no onToken callback
- [x] Strip think blocks from complete response: `stripThinkFromText(response)`
- [x] If tools defined: run `ToolCallParser` on complete response
  - Collect `tool_call` events → build `tool_calls[]` array
  - Remaining text → `content` field
- [x] Build `OpenAIChatCompletion` response:
  ```json
  {
    "id": "chatcmpl-...",
    "object": "chat.completion",
    "created": timestamp,
    "model": "...",
    "choices": [{ "index": 0, "message": { "role": "assistant", "content": "...", "tool_calls": [...] }, "finish_reason": "stop" | "tool_calls" }],
    "usage": { "prompt_tokens": N, "completion_tokens": N, "total_tokens": N }
  }
  ```
- [x] Return JSON response with `Content-Type: application/json`

**Tests**: Write 8 tests (appended to `tests/openai-handler.test.ts`)

**Tests (8):**
1. [ ] `non-streaming: returns application/json content type`
2. [ ] `non-streaming: response has correct OpenAI shape (id, object, choices, usage)`
3. [ ] `non-streaming: message has role "assistant" and content`
4. [ ] `non-streaming: finish_reason is "stop" for text-only response`
5. [ ] `non-streaming: tool_calls included when model returns tool call`
6. [ ] `non-streaming: finish_reason is "tool_calls" when tools used`
7. [ ] `non-streaming: think blocks stripped from response`
8. [ ] `non-streaming: usage includes prompt_tokens and completion_tokens`

**Reference Files:**
- `packages/claude-bridge/src/handler.ts:182-284` (non-streaming pattern)

**Success Criteria:**
- [x] All 18 handler tests pass (10 streaming + 8 non-streaming)
- [x] `src/openai-handler.ts` is ≤ 200 lines total

---

## Phase 6: Image Generation Handler

### Sub-phase 6.1: DALL-E Compatible Image Handler

**Goal**: Handle `POST /v1/images/generations` requests, translate to Fabstir's `generateImage()`, return OpenAI-format response.

**Line Budget**: 100 lines (`src/image-handler.ts`)

#### Tasks

**Request validation:**
- [x] Validate `prompt` is present and non-empty string
- [x] Validate `prompt` ≤ 2000 characters
- [x] Validate `size` if provided: map to Fabstir allowed sizes (OpenAI supports `256x256`, `512x512`, `1024x1024`, `1024x1792`, `1792x1024`; map `1024x1792` → `768x1024`, `1792x1024` → `1024x768`)
- [x] Default `size` to `1024x1024`
- [x] Validate `n` if provided: 1-4 (Fabstir generates one at a time, loop for n > 1)
- [x] Default `n` to `1`
- [x] Map `quality` to steps: `"standard"` → 4, `"hd"` → 20
- [x] Ignore `style` parameter (FLUX.2 doesn't support vivid/natural distinction)
- [x] Always return `b64_json` format (ignore `response_format: "url"` — Fabstir has no persistent image storage)

**Image generation flow:**
- [x] Get SessionManager and sessionId from SessionBridge
- [x] Call `sessionManager.generateImage(sessionId, prompt, { size, steps })` for each of `n` images
- [x] Build OpenAI response:
  ```json
  {
    "created": timestamp,
    "data": [
      { "b64_json": "<base64 PNG>", "revised_prompt": "original prompt" }
    ]
  }
  ```
- [x] For `n > 1`: generate sequentially, collect results into `data[]` array

**Error handling:**
- [x] `PROMPT_BLOCKED` → 400 `{ error: { message: "...", type: "invalid_request_error", code: "content_policy_violation" } }`
- [x] `RATE_LIMIT_EXCEEDED` → 429 `{ error: { message: "...", type: "rate_limit_error" } }`
- [x] `DIFFUSION_SERVICE_UNAVAILABLE` → 503 `{ error: { message: "...", type: "server_error" } }`
- [x] Other errors → 500 `{ error: { message: "...", type: "server_error" } }`

**Tests**: Write 14 tests in `tests/image-handler.test.ts`

**Test File**: `tests/image-handler.test.ts` (~150 lines)

**Tests (14):**
1. [ ] `successful generation returns OpenAI image response shape`
2. [ ] `response includes created timestamp and data array`
3. [ ] `data[0] has b64_json and revised_prompt`
4. [ ] `default size is 1024x1024`
5. [ ] `maps quality "standard" to 4 steps`
6. [ ] `maps quality "hd" to 20 steps`
7. [ ] `maps OpenAI size 1024x1792 to Fabstir 768x1024`
8. [ ] `maps OpenAI size 1792x1024 to Fabstir 1024x768`
9. [ ] `n=2 returns 2 images in data array`
10. [ ] `missing prompt returns 400 error`
11. [ ] `prompt exceeding 2000 chars returns 400 error`
12. [ ] `PROMPT_BLOCKED error returns 400 with content_policy_violation`
13. [ ] `RATE_LIMIT_EXCEEDED error returns 429`
14. [ ] `DIFFUSION_SERVICE_UNAVAILABLE error returns 503`

**Reference Files:**
- `packages/sdk-core/src/managers/SessionManager.ts:3431-3559` (generateImage method)
- `packages/sdk-core/src/types/image-generation.types.ts` (types)

**Success Criteria:**
- [x] All 14 image handler tests pass
- [x] `src/image-handler.ts` is ≤ 100 lines
- [x] Response format matches OpenAI DALL-E API spec

---

## Phase 7: Server, CLI & Integration Tests

### Sub-phase 7.1: HTTP Server

**Goal**: HTTP server with routing to chat completions and image generation handlers.

**Line Budget**: 110 lines (`src/server.ts`)

#### Tasks
- [x] Create HTTP server using `node:http` (same pattern as claude-bridge)
- [x] Route `GET /health` → `{ status: 'ok' }`
- [x] Route `GET /v1/models` → `{ object: 'list', data: [{ id: modelName, object: 'model' }] }`
- [x] Route `POST /v1/chat/completions` → `handleChatCompletions(req, res, bridge)`
- [x] Route `POST /v1/images/generations` → `handleImageGeneration(req, res, bridge)`
- [x] Route `OPTIONS *` → CORS preflight headers
- [x] Route `*` → 404 `{ error: { message: 'Not found', type: 'not_found_error' } }`
- [x] Validate `Content-Type: application/json` on POST requests
- [x] Validate `Authorization: Bearer <key>` if API key configured
- [x] Parse JSON body with error handling
- [x] Write 10 tests in `tests/server.test.ts`
- [x] Verify all tests pass

**Test File**: `tests/server.test.ts` (~120 lines)

**Tests (10):**
1. [ ] `GET /health returns 200 with { status: 'ok' }`
2. [ ] `GET /v1/models returns model list`
3. [ ] `POST /v1/chat/completions routes to chat handler`
4. [ ] `POST /v1/images/generations routes to image handler`
5. [ ] `OPTIONS returns CORS headers`
6. [ ] `unknown path returns 404`
7. [ ] `missing Content-Type returns 400`
8. [ ] `invalid JSON body returns 400`
9. [ ] `valid API key passes through`
10. [ ] `invalid API key returns 401`

**Reference Files:**
- `packages/claude-bridge/src/server.ts` (exact pattern — different routes)

**Success Criteria:**
- [x] All 10 server tests pass
- [x] `src/server.ts` is ≤ 110 lines

---

### Sub-phase 7.2: CLI Entry Point

**Goal**: Commander.js CLI with argument parsing and bridge startup.

**Line Budget**: 60 lines (`src/index.ts`)

#### Tasks
- [x] Import Commander.js, create program with name `openai-bridge`
- [x] Add options: `--port`, `--private-key`, `--model`, `--host`, `--chain-id`, `--api-key`, `--deposit`, `--rpc-url`, `--localhost-override`
- [x] Parse CLI args → merge with env vars → `validateConfig()`
- [x] Create SessionBridge, initialise
- [x] Create and start BridgeServer
- [x] Handle SIGINT/SIGTERM for graceful shutdown
- [x] Log startup info: `OpenAI Bridge listening on port XXXX`
- [x] Update `bin/openai-bridge` with correct path to compiled output
- [x] Write build script in package.json
- [x] Verify `pnpm build` compiles cleanly

**Reference Files:**
- `packages/claude-bridge/src/index.ts` (exact CLI pattern)
- `packages/claude-bridge/bin/claude-bridge` (shebang file)

**Success Criteria:**
- [x] `pnpm build` succeeds
- [x] `src/index.ts` is ≤ 60 lines

---

### Sub-phase 7.3: Integration Tests

**Goal**: End-to-end tests that verify the complete request flow through mocked SDK.

**Line Budget**: 200 lines (`tests/integration/bridge-flow.test.ts`)

#### Tasks
- [x] Write integration test: non-streaming chat completion → JSON response
- [x] Write integration test: streaming chat completion → SSE events in correct order
- [x] Write integration test: chat with tool use → tool_calls in response
- [x] Write integration test: multi-turn conversation with tool results
- [x] Write integration test: image generation → b64_json response
- [x] Write integration test: image generation with quality "hd" → 20 steps
- [x] Write integration test: chat with image_url content part → images passed to bridge
- [x] Write integration test: error handling → OpenAI error format
- [x] Verify all integration tests pass
- [x] Run full test suite: `pnpm test --run`

**Test File**: `tests/integration/bridge-flow.test.ts` (~200 lines)

**Tests (8):**
1. [ ] `non-streaming chat returns valid OpenAI ChatCompletion`
2. [ ] `streaming chat emits correct SSE event sequence`
3. [ ] `tool use returns tool_calls in response`
4. [ ] `multi-turn with tool results serialises as observation blocks`
5. [ ] `image generation returns OpenAI ImageResponse with b64_json`
6. [ ] `image generation with quality "hd" passes steps=20`
7. [ ] `vision message extracts image and passes to bridge`
8. [ ] `error returns OpenAI error format`

**Reference Files:**
- `packages/claude-bridge/tests/integration/bridge-flow.test.ts` (E2E test pattern)

**Success Criteria:**
- [x] All 8 integration tests pass
- [x] Full suite passes: `pnpm test --run`
- [x] Total test count: ~104 tests across all files

---

## File Summary

| File | Max Lines | Purpose | Phase |
|------|-----------|---------|-------|
| `src/types.ts` | 140 | OpenAI API interfaces | 1.2 |
| `src/config.ts` | 80 | Configuration + validation | 1.3 |
| `src/tool-parser.ts` | 95 | GLM tool XML parser (copy) | 2.1 |
| `src/think-stripper.ts` | 35 | Think block removal (extract) | 2.2 |
| `src/session-bridge.ts` | 130 | SDK integration (adapt) | 2.3 |
| `src/openai-converter.ts` | 120 | OpenAI messages → ChatML | 3.1 |
| `src/openai-sse.ts` | 80 | OpenAI SSE event builders | 4.1 |
| `src/openai-handler.ts` | 200 | Chat completions handler | 5.1, 5.2 |
| `src/image-handler.ts` | 100 | Image generation handler | 6.1 |
| `src/server.ts` | 110 | HTTP server + routing | 7.1 |
| `src/index.ts` | 60 | CLI entry point | 7.2 |
| **Total source** | **≤ 1,150** | | |

| Test File | ~Lines | Tests | Phase |
|-----------|--------|-------|-------|
| `tests/types.test.ts` | 100 | 12 | 1.2 |
| `tests/config.test.ts` | 80 | 8 | 1.3 |
| `tests/tool-parser.test.ts` | 140 | 14 | 2.1 |
| `tests/think-stripper.test.ts` | 60 | 8 | 2.2 |
| `tests/session-bridge.test.ts` | 130 | 10 | 2.3 |
| `tests/openai-converter.test.ts` | 200 | 16 | 3.1 |
| `tests/openai-sse.test.ts` | 120 | 10 | 4.1 |
| `tests/openai-handler.test.ts` | 250 | 18 | 5.1, 5.2 |
| `tests/image-handler.test.ts` | 150 | 14 | 6.1 |
| `tests/server.test.ts` | 120 | 10 | 7.1 |
| `tests/integration/bridge-flow.test.ts` | 200 | 8 | 7.3 |
| **Total tests** | **~1,550** | **128** | |

---

## Execution Order

| Step | Sub-phase | Dependencies | Status |
|------|-----------|-------------|--------|
| 1 | 1.1 Package Scaffold | None | |
| 2 | 1.2 OpenAI Types | 1.1 | |
| 3 | 1.3 Configuration | 1.1 | |
| 4 | 2.1 Tool Call Parser | 1.1 | |
| 5 | 2.2 Think Stripper | 1.1 | |
| 6 | 2.3 Session Bridge | 1.2, 1.3 | |
| 7 | 3.1 OpenAI Converter | 1.2, 2.1 | |
| 8 | 4.1 OpenAI SSE Builder | 1.2 | |
| 9 | 5.1 Streaming Chat Handler | 2.1, 2.2, 2.3, 3.1, 4.1 | |
| 10 | 5.2 Non-Streaming Chat Handler | 5.1 | |
| 11 | 6.1 Image Generation Handler | 2.3, 1.2 | |
| 12 | 7.1 HTTP Server | 5.1, 5.2, 6.1 | |
| 13 | 7.2 CLI Entry Point | 7.1, 2.3 | |
| 14 | 7.3 Integration Tests | All above | |

---

## Verification

### Unit Tests (after each sub-phase)
```bash
cd /workspace/packages/openai-bridge && pnpm test --run
```

### Build Check (after all sub-phases)
```bash
cd /workspace/packages/openai-bridge && pnpm build
```

### Manual Test — Chat Completions (curl)
```bash
# Start bridge
cd /workspace/packages/openai-bridge
node dist/index.js --private-key $TEST_USER_1_PRIVATE_KEY --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

# Non-streaming
curl -s http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"Hello"}]}'

# Streaming
curl -sN http://localhost:3457/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

### Manual Test — Image Generation (curl)
```bash
curl -s http://localhost:3457/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A cat astronaut floating in space","size":"1024x1024","quality":"standard"}'
```

### Manual Test — OpenAI SDK Client
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3457/v1',
  apiKey: 'any-key', // Bridge handles auth via wallet
});

// Chat
const chatResult = await client.chat.completions.create({
  model: 'test',
  messages: [{ role: 'user', content: 'Hello, how are you?' }],
});
console.log(chatResult.choices[0].message.content);

// Image
const imageResult = await client.images.generate({
  prompt: 'A serene mountain lake at golden hour',
  size: '1024x1024',
  quality: 'hd',
  response_format: 'b64_json',
});
console.log(`Generated image: ${imageResult.data[0].b64_json?.substring(0, 50)}...`);
```

### Manual Test — Third-Party Tool (Cursor/Continue)
1. Configure tool to use `http://localhost:3457/v1` as API base URL
2. Set any string as API key
3. Verify chat completions work
4. Verify streaming works

---

## Progress Tracker

- [x] Phase 1: Package Scaffold, Types & Config (Sub-phases 1.1, 1.2, 1.3)
- [x] Phase 2: Shared Utils (Sub-phases 2.1, 2.2, 2.3)
- [x] Phase 3: OpenAI Message Converter (Sub-phase 3.1)
- [x] Phase 4: OpenAI SSE Builder (Sub-phase 4.1)
- [x] Phase 5: Chat Completions Handler (Sub-phases 5.1, 5.2)
- [x] Phase 6: Image Generation Handler (Sub-phase 6.1)
- [x] Phase 7: Server, CLI & Integration Tests (Sub-phases 7.1, 7.2, 7.3)
