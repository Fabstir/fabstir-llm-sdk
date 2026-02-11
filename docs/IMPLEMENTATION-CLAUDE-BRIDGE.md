# Implementation Plan: Claude Bridge — Local Anthropic API Proxy via SDK

## Overview

Create a new `packages/claude-bridge/` package that runs a local HTTP server exposing an Anthropic Messages API-compatible endpoint (`POST /v1/messages`). Claude Code connects to this bridge on localhost, and the bridge translates requests into Fabstir SDK calls, routing all inference through the existing **E2E encrypted WebSocket** path to Platformless AI host nodes.

```
Claude Code → localhost:3456/v1/messages → claude-bridge (SDK) → WebSocket (E2E encrypted) → Node
```

## Status: Phases 1-8 Complete

**Implementation**: Claude Bridge — Anthropic API Proxy
**Package**: `@fabstir/claude-bridge` v0.1.0
**Network**: Base Sepolia (Chain ID: 84532)
**Prerequisite**: Working `@fabstir/sdk-core` with E2E encrypted streaming (v1.13.4+)

### Phases Overview:
- [x] Phase 1: Package Setup & Types
- [x] Phase 2: Message Conversion
- [x] Phase 3: SSE Event Builder
- [x] Phase 4: Session Bridge (SDK Lifecycle)
- [x] Phase 5: HTTP Request Handler
- [x] Phase 6: HTTP Server
- [x] Phase 7: CLI Entry Point
- [x] Phase 8: Integration Testing
- [ ] Phase 9: Anonymous Host Discovery
- [ ] Phase 10: Tool Use Support (Function Calling)

---

## Summary of Changes

| Aspect | Current (SDK-Mediated) | New (Claude Bridge) |
|--------|------------------------|---------------------|
| Client | Browser UI (apps/harness) | Claude Code CLI |
| API Format | SDK TypeScript methods | Anthropic Messages API (HTTP) |
| Transport | SDK → WebSocket (encrypted) | HTTP → SDK → WebSocket (encrypted) |
| Session Mgmt | Manual (UI buttons) | Automatic (bridge manages lifecycle) |
| Prompt Format | Single string | Anthropic messages[] → ChatML → string |

### Architecture

```
┌────────────┐   POST /v1/messages   ┌───────────────┐   sendPromptStreaming()   ┌─────────────┐
│ Claude Code │ ──────────────────── │ claude-bridge  │ ──────────────────────── │   SDK Core   │
│   (client)  │   Anthropic format   │  (localhost)   │   onToken callbacks      │ SessionMgr   │
└────────────┘ ◄──────────────────── └───────────────┘ ◄──────────────────────── │EncryptionMgr │
                SSE streaming                                                     └──────┬──────┘
                                                                                         │ WebSocket
                                                                                         │ E2E encrypted
                                                                                  ┌──────▼──────┐
                                                                                  │  Host Node   │
                                                                                  │  (remote)    │
                                                                                  └─────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message conversion | ChatML template on bridge side | Works for GLM-4.7-Flash, TinyVicuna, most GGUF models; no node changes |
| HTTP server | Native Node.js `http` module | No Express dependency; lightweight |
| Session lifecycle | Auto-create on first request, reuse | Transparent to Claude Code |
| Request serialization | Async FIFO queue | SDK processes one prompt at a time per session |
| Input token estimation | `Math.ceil(prompt.length / 4)` | Rough estimate; sufficient for display |
| Polyfills | `fake-indexeddb/auto` + `ws` | Same pattern as `packages/host-cli/src/index.ts:44-48` |

### SDK Interface (Existing — Reuse As-Is)

| Interface | Location | Used By |
|-----------|----------|---------|
| `sendPromptStreaming(sessionId, prompt, onToken, options)` | `SessionManager.ts:690` | Core inference call |
| `startSession(config: ExtendedSessionConfig)` | `SessionManager.ts:221` | Session creation |
| `endSession(sessionId)` | `SessionManager.ts` | Session cleanup |
| `getLastTokenUsage(sessionId)` | `SessionManager.ts` | Token metrics |
| `PromptOptions { images?, onTokenUsage? }` | `types/index.ts:135-139` | Options for sendPromptStreaming |
| `ImageAttachment { data, format }` | `types/index.ts:130-133` | Image payloads |
| `TokenUsageInfo { llmTokens, vlmTokens, totalTokens }` | `types/index.ts:143-150` | Token reporting |
| `ExtendedSessionConfig` | `SessionManager.ts:135-151` | Session config |
| `FabstirSDKCore` | `FabstirSDKCore.ts` | SDK entry point |
| `ChainRegistry.getChain(ChainId.BASE_SEPOLIA)` | `config/ChainRegistry.ts` | Contract addresses |

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Package Structure

```
packages/claude-bridge/
├── package.json                          # @fabstir/claude-bridge
├── tsconfig.json                         # TypeScript config (ES2022, commonjs)
├── vitest.config.ts                      # Test runner config
├── bin/claude-bridge                     # #!/usr/bin/env node shebang
├── src/
│   ├── index.ts                          # CLI entry point (~60 lines)
│   ├── config.ts                         # Config & validation (~80 lines)
│   ├── types.ts                          # Anthropic API types (~120 lines)
│   ├── converter.ts                      # Messages → ChatML + images (~90 lines)
│   ├── sse.ts                            # SSE event builders (~100 lines)
│   ├── session-bridge.ts                 # SDK lifecycle + queue (~150 lines)
│   ├── handler.ts                        # HTTP request handlers (~200 lines)
│   ├── tool-parser.ts                    # Streaming <tool_call> state machine (~80 lines)
│   └── server.ts                         # HTTP server + routing (~100 lines)
└── tests/
    ├── types.test.ts                     # Type validation tests
    ├── config.test.ts                    # Config validation tests
    ├── converter.test.ts                 # Conversion tests
    ├── sse.test.ts                       # SSE format tests
    ├── session-bridge.test.ts            # SDK lifecycle tests
    ├── handler.test.ts                   # Handler tests (streaming + non-streaming)
    ├── server.test.ts                    # HTTP server tests
    ├── tool-parser.test.ts              # Tool call parser tests
    └── integration/
        └── bridge-flow.test.ts           # End-to-end flow tests
```

---

## Phase 1: Package Setup & Types

### Sub-phase 1.1: Package Infrastructure

**Goal**: Create the package skeleton with build and test tooling.

**Line Budget**: 0 source lines (config files only)

#### Tasks
- [ ] Create `packages/claude-bridge/` directory
- [ ] Create `package.json` with name `@fabstir/claude-bridge`, version `0.1.0`
- [ ] Add dependencies: `@fabstir/sdk-core` (workspace:*), `commander` (^11.1.0), `dotenv` (^16.3.0), `fake-indexeddb` (^6.0.0), `ws` (^8.18.3)
- [ ] Add devDependencies: `@types/node` (^20.10.5), `@types/ws` (^8.18.1), `typescript` (^5.3.0), `vitest` (^1.6.1)
- [ ] Add `bin` entry: `"fabstir-claude-bridge": "./bin/claude-bridge"`
- [ ] Add scripts: `build`, `test`, `dev`, `clean`, `start`
- [ ] Create `tsconfig.json` (target ES2022, module commonjs, outDir ./dist, rootDir ./src)
- [ ] Create `vitest.config.ts` (globals: true, environment: 'node')
- [ ] Create `bin/claude-bridge` shebang script: `#!/usr/bin/env node\nrequire('../dist/index.js');`
- [ ] Run `pnpm install` from workspace root to link dependencies
- [ ] Verify `pnpm build` succeeds (with empty `src/index.ts`)

**Reference Files:**
- `packages/host-cli/package.json` (dependency and script patterns)
- `packages/host-cli/tsconfig.json` (TypeScript config pattern)

**Success Criteria:**
- [ ] `pnpm install` completes without errors
- [ ] `pnpm build` produces `dist/` directory
- [ ] `pnpm test` runs (no tests yet, exits clean)

---

### Sub-phase 1.2: Anthropic API Types

**Goal**: Define TypeScript interfaces for the Anthropic Messages API request/response formats.

**Line Budget**: 120 lines (`src/types.ts`)

#### Tasks
- [ ] Define `AnthropicRequest` interface (model, max_tokens, messages, system?, temperature?, top_p?, top_k?, stop_sequences?, stream?, metadata?)
- [ ] Define `AnthropicMessage` interface (role: string, content: string | ContentBlock[])
- [ ] Define `ContentBlock` type union: `TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock`
- [ ] Define `TextBlock` interface (type: "text", text: string)
- [ ] Define `ImageBlock` interface (type: "image", source: ImageSource)
- [ ] Define `ImageSource` interface (type: "base64", media_type: string, data: string)
- [ ] Define `ToolUseBlock` interface (type: "tool_use", id: string, name: string, input: any)
- [ ] Define `ToolResultBlock` interface (type: "tool_result", tool_use_id: string, content: string | ContentBlock[])
- [ ] Define `AnthropicResponse` interface (id, type: "message", role, content: ResponseBlock[], model, stop_reason, stop_sequence, usage)
- [ ] Define `ResponseBlock` interface (type: "text", text: string)
- [ ] Define `Usage` interface (input_tokens: number, output_tokens: number)
- [ ] Define `AnthropicError` interface (type: "error", error: { type: string, message: string })
- [ ] Define SSE event data types: `MessageStartData`, `ContentBlockStartData`, `ContentBlockDeltaData`, `ContentBlockStopData`, `MessageDeltaData`, `MessageStopData`
- [ ] Write 9 tests in `tests/types.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/types.test.ts` (~50 lines)

**Tests (9):**
1. [ ] AnthropicRequest has required fields: model, max_tokens, messages
2. [ ] AnthropicRequest has optional fields: system, temperature, stream
3. [ ] AnthropicMessage content supports string form
4. [ ] AnthropicMessage content supports ContentBlock[] form
5. [ ] ImageSource has type "base64", media_type, data fields
6. [ ] AnthropicResponse has id, type "message", role, content[], model, stop_reason, usage
7. [ ] Usage has input_tokens and output_tokens as numbers
8. [ ] AnthropicError has type "error" and nested error object with type and message
9. [ ] stream defaults to false when absent from request

**Success Criteria:**
- [ ] All 9 type tests pass
- [ ] TypeScript compilation succeeds
- [ ] `src/types.ts` is ≤ 120 lines

---

### Sub-phase 1.3: Bridge Configuration

**Goal**: Define CLI configuration interface with defaults and validation.

**Line Budget**: 80 lines (`src/config.ts`)

#### Tasks
- [ ] Define `BridgeConfig` interface: port, privateKey, rpcUrl, hostAddress, modelName, chainId, depositAmount, pricePerToken, proofInterval, duration, apiKey?
- [ ] Define `DEFAULT_PORT = 3456`
- [ ] Define `DEFAULT_CHAIN_ID = 84532`
- [ ] Define `DEFAULT_DEPOSIT_AMOUNT = '0.0002'`
- [ ] Define `DEFAULT_PRICE_PER_TOKEN = 5000`
- [ ] Define `DEFAULT_PROOF_INTERVAL = 100`
- [ ] Define `DEFAULT_DURATION = 86400`
- [ ] Implement `validateConfig(config: Partial<BridgeConfig>): BridgeConfig` — throws on missing required fields
- [ ] Implement `loadConfigFromEnv(): Partial<BridgeConfig>` — reads `CLAUDE_BRIDGE_*` env vars
- [ ] Write 7 tests in `tests/config.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/config.test.ts` (~60 lines)

**Tests (7):**
1. [ ] Default port is 3456
2. [ ] Default chainId is 84532
3. [ ] Default depositAmount is '0.0002'
4. [ ] validateConfig throws on missing privateKey
5. [ ] validateConfig throws on missing hostAddress
6. [ ] validateConfig throws on missing modelName
7. [ ] loadConfigFromEnv reads CLAUDE_BRIDGE_PORT, CLAUDE_BRIDGE_PRIVATE_KEY, CLAUDE_BRIDGE_HOST env vars

**Success Criteria:**
- [ ] All 7 config tests pass
- [ ] Validation fails fast with clear error messages
- [ ] `src/config.ts` is ≤ 80 lines

---

## Phase 2: Message Conversion

### Sub-phase 2.1: Anthropic Messages → ChatML Prompt

**Goal**: Convert Anthropic `messages[]` array to a ChatML-formatted prompt string and extract image attachments.

**Line Budget**: 90 lines (`src/converter.ts`)

#### Tasks
- [ ] Implement `convertMessages(messages: AnthropicMessage[], system?: string): { prompt: string, images: ImageAttachment[] }`
- [ ] Format system prompt as `<|im_start|>system\n{text}\n<|im_end|>\n`
- [ ] Format user messages as `<|im_start|>user\n{text}\n<|im_end|>\n`
- [ ] Format assistant messages as `<|im_start|>assistant\n{text}\n<|im_end|>\n`
- [ ] Append `<|im_start|>assistant\n` at end (model continuation prompt)
- [ ] Handle content as string shorthand (convert to text block internally)
- [ ] Handle content as ContentBlock[] — concatenate text blocks, extract image blocks
- [ ] Map Anthropic `media_type` (e.g., "image/png") to SDK `ImageFormat` ("png")
- [ ] Serialize tool_use blocks as text: `[Tool Use: {name}]\n{JSON.stringify(input)}`
- [ ] Serialize tool_result blocks as text: `[Tool Result: {tool_use_id}]\n{content}`
- [ ] Throw error on empty messages array
- [ ] Implement `estimateInputTokens(prompt: string): number` — `Math.ceil(prompt.length / 4)`
- [ ] Write 10 tests in `tests/converter.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/converter.test.ts` (~90 lines)

**Tests (10):**
1. [ ] Single user message produces correct ChatML with `<|im_start|>user` and `<|im_end|>` tags
2. [ ] System prompt prepended with `<|im_start|>system` tag
3. [ ] Multi-turn conversation (user/assistant/user) preserves message order
4. [ ] Content as string produces same output as content as `[{type:"text", text:"..."}]`
5. [ ] Image blocks extracted to `ImageAttachment[]` with correct data and format
6. [ ] Mixed text + image in same message: text goes to prompt, images to array
7. [ ] Tool use blocks serialized as readable text in prompt
8. [ ] Tool result blocks serialized as readable text in prompt
9. [ ] Empty messages array throws error
10. [ ] `estimateInputTokens("hello world")` returns 3 (11 chars / 4 = 2.75, ceil = 3)

**Reference Files:**
- `packages/sdk-core/src/types/index.ts:128-133` (`ImageFormat`, `ImageAttachment`)

**Success Criteria:**
- [ ] All 10 converter tests pass
- [ ] ChatML output is correct for all message types
- [ ] Images extracted with correct format mapping
- [ ] `src/converter.ts` is ≤ 90 lines

---

## Phase 3: SSE Event Builder

### Sub-phase 3.1: SSE Event Formatting

**Goal**: Build Anthropic-compatible Server-Sent Event strings for streaming responses.

**Line Budget**: 100 lines (`src/sse.ts`)

#### Tasks
- [ ] Implement `generateMessageId(): string` — returns `"msg_" + randomUUID()`
- [ ] Implement `buildMessageStart(msgId: string, model: string, inputTokens: number): string`
- [ ] Implement `buildContentBlockStart(index: number): string`
- [ ] Implement `buildContentBlockDelta(index: number, text: string): string`
- [ ] Implement `buildContentBlockStop(index: number): string`
- [ ] Implement `buildMessageDelta(stopReason: string, outputTokens: number): string`
- [ ] Implement `buildMessageStop(): string`
- [ ] Implement `buildErrorEvent(errorType: string, message: string): string`
- [ ] All SSE strings follow format: `event: {name}\ndata: {json}\n\n`
- [ ] Write 8 tests in `tests/sse.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/sse.test.ts` (~80 lines)

**SSE Event Sequence (what Claude Code expects):**
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","type":"message","role":"assistant","content":[],"model":"...","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":N,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"token"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":N}}

event: message_stop
data: {"type":"message_stop"}
```

**Tests (8):**
1. [ ] `buildMessageStart` produces correct JSON shape with `usage.input_tokens`
2. [ ] `buildContentBlockStart` has `index` and `content_block` with type "text"
3. [ ] `buildContentBlockDelta` wraps text in `delta.type: "text_delta"`
4. [ ] `buildContentBlockStop` has correct index
5. [ ] `buildMessageDelta` has `stop_reason` and `usage.output_tokens`
6. [ ] `buildMessageStop` has `type: "message_stop"`
7. [ ] `generateMessageId()` returns string starting with `"msg_"`
8. [ ] All events end with double newline `\n\n`

**Success Criteria:**
- [ ] All 8 SSE tests pass
- [ ] SSE output matches Anthropic streaming format exactly
- [ ] `src/sse.ts` is ≤ 100 lines

---

## Phase 4: Session Bridge (SDK Lifecycle)

### Sub-phase 4.1: SDK Session Lifecycle Management

**Goal**: Manage SDK initialization, authentication, session creation/reuse, and request queuing.

**Line Budget**: 150 lines (`src/session-bridge.ts`)

#### Tasks
- [ ] Import polyfills: `fake-indexeddb/auto`, `ws` as global WebSocket (same as `host-cli/src/index.ts:44-48`)
- [ ] Define `SessionBridge` class with `constructor(config: BridgeConfig)`
- [ ] Implement `async initialize()`:
  - [ ] Create `FabstirSDKCore` with chainId, rpcUrl, contractAddresses from `ChainRegistry`
  - [ ] Call `sdk.authenticate('privatekey', { privateKey: config.privateKey })`
  - [ ] Store `sessionManager = sdk.getSessionManager()`
- [ ] Implement `async ensureSession(): Promise<bigint>`:
  - [ ] On first call: `startSession()` with `ExtendedSessionConfig` (chainId, host, modelId, paymentMethod: 'deposit', depositAmount, pricePerToken, proofInterval, duration, encryption: true)
  - [ ] On subsequent calls: return stored sessionId
- [ ] Implement `async sendPrompt(prompt: string, onToken?: (token: string) => void, options?: PromptOptions): Promise<{ response: string, tokenUsage?: TokenUsageInfo }>`:
  - [ ] Call `ensureSession()` to get/create session
  - [ ] Call `sessionManager.sendPromptStreaming(sessionId, prompt, onToken, options)`
  - [ ] Get `tokenUsage` via `sessionManager.getLastTokenUsage(sessionId)`
  - [ ] Return `{ response, tokenUsage }`
- [ ] Implement request queue (FIFO) — serialize concurrent requests
- [ ] Implement session auto-recovery: catch `SESSION_NOT_FOUND` / `SESSION_NOT_ACTIVE` errors, clear stored session, retry once with new session
- [ ] Implement `async shutdown()`: call `endSession()`, cleanup SDK
- [ ] Write 10 tests in `tests/session-bridge.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/session-bridge.test.ts` (~120 lines)

**SDK Initialization Pattern (reuse):**
```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';

const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
const sdk = new FabstirSDKCore({
  chainId: config.chainId,
  rpcUrl: config.rpcUrl || chain.rpcUrl,
  contractAddresses: { ...chain.contracts },
  mode: 'production'
});
await sdk.authenticate('privatekey', { privateKey: config.privateKey });
const sessionManager = sdk.getSessionManager();
```

**Session Start Pattern (reuse):**
```typescript
const { sessionId, jobId } = await sessionManager.startSession({
  chainId: config.chainId,
  host: config.hostAddress,
  modelId: config.modelName,
  paymentMethod: 'deposit',
  depositAmount: config.depositAmount,
  pricePerToken: config.pricePerToken,
  proofInterval: config.proofInterval,
  duration: config.duration,
  encryption: true
});
```

**Tests (10):**
1. [ ] Constructor stores config correctly
2. [ ] `initialize()` creates FabstirSDKCore with correct chainId and contractAddresses
3. [ ] `initialize()` calls `authenticate('privatekey', { privateKey })` with config key
4. [ ] `ensureSession()` calls `startSession()` on first invocation
5. [ ] `ensureSession()` returns same sessionId on second invocation (no second `startSession()`)
6. [ ] `sendPrompt()` calls `sendPromptStreaming()` with correct sessionId, prompt, and callbacks
7. [ ] `sendPrompt()` returns `{ response, tokenUsage }` from SDK
8. [ ] Auto-recreates session on `SESSION_NOT_FOUND` error (clears stored session, retries)
9. [ ] Auto-recreates session on `SESSION_NOT_ACTIVE` error (clears stored session, retries)
10. [ ] `shutdown()` calls `endSession()` on active session

**Reference Files:**
- `packages/sdk-core/src/FabstirSDKCore.ts` (SDK init and authenticate)
- `packages/sdk-core/src/managers/SessionManager.ts:135-151` (ExtendedSessionConfig)
- `packages/sdk-core/src/managers/SessionManager.ts:690-695` (sendPromptStreaming signature)
- `packages/host-cli/src/index.ts:44-48` (polyfill pattern)

**Success Criteria:**
- [ ] All 10 session bridge tests pass
- [ ] SDK is initialized with correct chain config
- [ ] Sessions are created, reused, and recovered correctly
- [ ] Concurrent requests are serialized
- [ ] `src/session-bridge.ts` is ≤ 150 lines

---

## Phase 5: HTTP Request Handler

### Sub-phase 5.1: Non-Streaming Handler

**Goal**: Handle `POST /v1/messages` with `stream: false` (or absent).

**Line Budget**: 80 lines (non-streaming portion of `src/handler.ts`)

#### Tasks
- [ ] Implement `handleMessages(req, res, sessionBridge)` entry function
- [ ] Parse JSON request body into `AnthropicRequest`
- [ ] Validate: messages non-empty, max_tokens > 0
- [ ] Call `convertMessages()` to get prompt string and images
- [ ] Call `estimateInputTokens()` for usage reporting
- [ ] If `stream !== true`: call `sessionBridge.sendPrompt(prompt, undefined, { images })`
- [ ] Build `AnthropicResponse` with: `id` (msg_uuid), `type: "message"`, `role: "assistant"`, `content: [{type: "text", text: response}]`, `model`, `stop_reason: "end_turn"`, `usage`
- [ ] Map `tokenUsage.llmTokens` → `usage.output_tokens`, estimated → `usage.input_tokens`
- [ ] Return JSON response with `Content-Type: application/json`
- [ ] On validation error: return 400 with `AnthropicError` format
- [ ] On SDK error: return 500 with `AnthropicError` format
- [ ] Write 7 tests in `tests/handler.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/handler.test.ts` (~80 lines for non-streaming)

**Tests (7):**
1. [ ] Valid request → 200 with response shape (id starts "msg_", type "message", role "assistant")
2. [ ] Response content is `[{type: "text", text: "..."}]`
3. [ ] Response has `usage.input_tokens` and `usage.output_tokens` as numbers
4. [ ] Missing `messages` field → 400 with `{type: "error", error: {type: "invalid_request_error", message: "..."}}`
5. [ ] Missing `max_tokens` field → 400 with Anthropic error format
6. [ ] Empty messages array → 400 with Anthropic error format
7. [ ] SDK error → 500 with `{type: "error", error: {type: "api_error", message: "..."}}`

**Success Criteria:**
- [ ] All 7 non-streaming handler tests pass
- [ ] Response format matches Anthropic Messages API exactly
- [ ] Errors use Anthropic error format

---

### Sub-phase 5.2: Streaming Handler

**Goal**: Handle `POST /v1/messages` with `stream: true`, returning SSE events.

**Line Budget**: 80 lines (streaming portion added to `src/handler.ts`, total ≤ 160 lines)

#### Tasks
- [ ] If `stream === true`: set response headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
- [ ] Write `buildMessageStart()` event immediately
- [ ] Write `buildContentBlockStart(0)` event
- [ ] Pass `onToken` callback to `sessionBridge.sendPrompt()` that writes `buildContentBlockDelta(0, token)` for each token
- [ ] After sendPrompt resolves: write `buildContentBlockStop(0)`
- [ ] Write `buildMessageDelta("end_turn", outputTokens)` with token usage
- [ ] Write `buildMessageStop()`
- [ ] End response
- [ ] On SDK error during streaming: write error event, end response
- [ ] Write 7 tests in `tests/handler.test.ts` (added to existing file)
- [ ] Verify all tests pass

**Test File:** `tests/handler.test.ts` (~70 additional lines, total ≤ 150 lines)

**Tests (7):**
1. [ ] `stream: true` → response `Content-Type` is `text/event-stream`
2. [ ] First SSE event is `message_start`
3. [ ] Token callbacks produce `content_block_delta` events with correct text
4. [ ] After all tokens: `content_block_stop`, `message_delta`, `message_stop` emitted in order
5. [ ] `message_delta` event includes `usage.output_tokens` from `TokenUsageInfo`
6. [ ] Response headers include `Cache-Control: no-cache`
7. [ ] SDK error during streaming produces error event and ends stream

**Success Criteria:**
- [ ] All 14 handler tests pass (7 non-streaming + 7 streaming)
- [ ] SSE event sequence matches what Claude Code expects
- [ ] `src/handler.ts` is ≤ 160 lines total

---

## Phase 6: HTTP Server

### Sub-phase 6.1: HTTP Server Core

**Goal**: Native Node.js HTTP server with routing, CORS, and health check.

**Line Budget**: 100 lines (`src/server.ts`)

#### Tasks
- [ ] Implement `BridgeServer` class with `constructor(port: number, sessionBridge: SessionBridge, apiKey?: string)`
- [ ] Implement `async start(): Promise<void>` — creates `http.createServer()`, listens on port
- [ ] Route `POST /v1/messages` → `handleMessages()` from handler.ts
- [ ] Route `GET /health` → `{ status: "ok" }` JSON response
- [ ] Route `OPTIONS /v1/messages` → CORS preflight response (Allow-Origin: *, Allow-Methods: POST, Allow-Headers: content-type, x-api-key, anthropic-version)
- [ ] Unknown routes → 404 JSON error
- [ ] Non-POST on `/v1/messages` → 405 JSON error
- [ ] If `apiKey` configured: validate `x-api-key` header (403 if mismatch); if not configured: accept any/no key
- [ ] Accept `anthropic-version` header without validation
- [ ] Implement `async stop(): Promise<void>` — close server
- [ ] Implement JSON body parsing (collect request body chunks, JSON.parse)
- [ ] Write 8 tests in `tests/server.test.ts`
- [ ] Verify all tests pass

**Test File:** `tests/server.test.ts` (~90 lines)

**Tests (8):**
1. [ ] Server starts on configured port and accepts connections
2. [ ] `GET /health` → 200 with `{ status: "ok" }`
3. [ ] `POST /v1/messages` with valid body routes to handler (returns response)
4. [ ] `OPTIONS /v1/messages` → 200 with CORS headers
5. [ ] `GET /v1/unknown` → 404
6. [ ] `GET /v1/messages` → 405 (Method Not Allowed)
7. [ ] `x-api-key` accepted but not required when no apiKey configured
8. [ ] `stop()` closes server and frees port

**Success Criteria:**
- [ ] All 8 server tests pass
- [ ] Routing works correctly for all endpoints
- [ ] CORS preflight enables browser-based testing
- [ ] `src/server.ts` is ≤ 100 lines

---

## Phase 7: CLI Entry Point

### Sub-phase 7.1: Commander CLI

**Goal**: CLI entry point that parses flags, initializes bridge, and starts server.

**Line Budget**: 60 lines (`src/index.ts`)

#### Tasks
- [ ] Import polyfills at top of file: `import 'fake-indexeddb/auto'` and WebSocket global
- [ ] Import `dotenv` and load env file
- [ ] Set up Commander program with name `fabstir-claude-bridge` and version `0.1.0`
- [ ] Add CLI options:
  - [ ] `--port <number>` (default: 3456)
  - [ ] `--private-key <key>` (required, or via `CLAUDE_BRIDGE_PRIVATE_KEY` env var)
  - [ ] `--host <address>` (required — host node Ethereum address)
  - [ ] `--host-url <url>` (optional — host node endpoint URL, auto-discovered if omitted)
  - [ ] `--model <name>` (required — model string, e.g., "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf")
  - [ ] `--chain-id <number>` (default: 84532)
  - [ ] `--deposit <amount>` (default: '0.0002')
  - [ ] `--rpc-url <url>` (optional — override RPC URL)
  - [ ] `--env-file <path>` (default: '.env.test')
  - [ ] `--api-key <key>` (optional — require x-api-key from clients)
- [ ] In action handler: load env file, build config (CLI flags override env vars), validate
- [ ] Create `SessionBridge` → call `initialize()`
- [ ] Create `BridgeServer` → call `start()`
- [ ] Print startup message:
  ```
  Claude Bridge running on http://localhost:{port}
  Set ANTHROPIC_BASE_URL=http://localhost:{port} in Claude Code
  ```
- [ ] Register SIGINT/SIGTERM handlers → call `server.stop()` then `bridge.shutdown()`
- [ ] Call `program.parse(process.argv)` at end

**Reference Files:**
- `packages/host-cli/src/index.ts` (Commander setup, polyfill pattern, signal handling)

**Success Criteria:**
- [ ] `fabstir-claude-bridge --help` shows all options
- [ ] Bridge starts with required flags
- [ ] Missing required flags produce clear error
- [ ] Graceful shutdown on Ctrl+C
- [ ] `src/index.ts` is ≤ 60 lines

---

## Phase 8: Integration Testing

### Sub-phase 8.1: End-to-End Flow Tests

**Goal**: Verify the complete request lifecycle from Anthropic format through SDK calls.

**Line Budget**: 0 source lines (tests only, ~100 lines)

#### Tasks
- [ ] Create mock `SessionBridge` that simulates SDK behavior (returns canned responses, fires token callbacks)
- [ ] Create `BridgeServer` with mock bridge
- [ ] Test non-streaming: send Anthropic request → verify JSON response shape
- [ ] Test streaming: send Anthropic request with `stream: true` → verify SSE event sequence
- [ ] Test multi-turn: send messages with user/assistant/user → verify ChatML prompt structure
- [ ] Test image extraction: send message with image content block → verify `ImageAttachment` passed to SDK
- [ ] Test session auto-recovery: mock bridge throws `SESSION_NOT_FOUND` on first call, succeeds on retry

**Test File:** `tests/integration/bridge-flow.test.ts` (~100 lines)

**Tests (5):**
1. [ ] Non-streaming: full request → response cycle with correct Anthropic JSON format
2. [ ] Streaming: full request → SSE event sequence (message_start → content_block_start → deltas → content_block_stop → message_delta → message_stop)
3. [ ] Multi-turn conversation: messages array builds correct ChatML prompt with all roles
4. [ ] Image content block extracted and passed as `ImageAttachment` to bridge
5. [ ] Session error triggers auto-recovery and successful retry

**Success Criteria:**
- [ ] All 5 integration tests pass
- [ ] Full request lifecycle works end-to-end with mock SDK
- [ ] `tests/integration/bridge-flow.test.ts` is ≤ 100 lines

---

## Phase 9: Anonymous Host Discovery

### Motivation

Host nodes are anonymous to the user. The Phase 1-8 implementation requires `--host <address>` (a specific host node's Ethereum address), which breaks the decentralized design. The SDK already has automatic host discovery via `HostSelectionService.selectHostForModel()` — when `host` is omitted from `ExtendedSessionConfig` in `startSession()`, the SDK queries the `NodeRegistry` smart contract and selects the best host using a weighted algorithm.

**SDK auto-discovery flow** (`SessionManager.ts:245-274`):
1. `startSession()` detects missing `host`/`provider` field
2. Gets user's `HostSelectionMode` from `StorageManager` (default: `AUTO`)
3. Converts model string to `bytes32` hash
4. Calls `HostSelectionService.selectHostForModel(modelId, mode)` — ranks candidates by stake (35%), price (30%), uptime (20%), latency (15%)
5. Throws `NO_HOSTS_AVAILABLE` if no host serves the model
6. Stores selected host for next session

**Fix**: Make `--host` optional in the bridge CLI. When omitted, let the SDK auto-discover.

### Sub-phase 9.1: Make hostAddress Optional in Config

**Goal**: Change `BridgeConfig.hostAddress` from required to optional and update validation.

**Line Budget**: ≤ 5 modified lines in `src/config.ts`, ≤ 10 modified lines in `tests/config.test.ts`

#### Tasks
- [x] In `BridgeConfig` interface: change `hostAddress: string` → `hostAddress?: string`
- [x] In `validateConfig()`: remove the `if (!config.hostAddress) throw` check
- [x] In `validateConfig()` return block: change `hostAddress: config.hostAddress` → `hostAddress: config.hostAddress ?? undefined`
- [x] Update test `'validateConfig throws on missing hostAddress'` → `'validateConfig accepts missing hostAddress for auto-discovery'` — verify it returns a valid config with `hostAddress` undefined
- [x] Add test: `'validateConfig preserves hostAddress when explicitly provided'` — verify manually specified host is kept
- [x] Verify all config tests pass

**Tests (7 → 8):**
1. [x] Default port is 3456
2. [x] Default chainId is 84532
3. [x] Default depositAmount is '0.0002'
4. [x] validateConfig throws on missing privateKey
5. [x] validateConfig accepts missing hostAddress for auto-discovery *(was: throws on missing)*
6. [x] validateConfig throws on missing modelName
7. [x] loadConfigFromEnv reads env vars
8. [x] validateConfig preserves hostAddress when explicitly provided *(new)*

**Reference Files:**
- `packages/claude-bridge/src/config.ts` (current: 77 lines)
- `packages/claude-bridge/tests/config.test.ts` (current: 71 lines)

**Success Criteria:**
- [ ] All 8 config tests pass
- [ ] `validateConfig({ privateKey: 'x', modelName: 'y' })` succeeds (no hostAddress required)
- [ ] `validateConfig({ privateKey: 'x', modelName: 'y', hostAddress: '0xABC' })` preserves hostAddress
- [ ] `src/config.ts` stays ≤ 80 lines

---

### Sub-phase 9.2: Conditional Host in Session Bridge

**Goal**: Only pass `host` to `startSession()` when explicitly configured; omit it for SDK auto-discovery.

**Line Budget**: ≤ 10 modified lines in `src/session-bridge.ts`, ≤ 20 new lines in `tests/session-bridge.test.ts`

#### Tasks
- [x] In `ensureSession()`: build session config object without `host`, then conditionally add `host: this.config.hostAddress` only if `this.config.hostAddress` is defined
- [x] Add test: `'ensureSession() omits host from startSession when hostAddress not configured'` — create bridge with no hostAddress, verify `startSession()` is called without a `host` property
- [x] Add test: `'ensureSession() includes host in startSession when hostAddress is configured'` — verify existing behavior preserved
- [x] Verify all session-bridge tests pass

**Tests (10 → 12):**
1-10. [x] *(existing tests — unchanged, they use testConfig which has hostAddress)*
11. [x] `ensureSession()` omits host from startSession when hostAddress not configured *(new)*
12. [x] `ensureSession()` includes host in startSession when hostAddress is configured *(new)*

**Reference Files:**
- `packages/claude-bridge/src/session-bridge.ts` (current: 112 lines)
- `packages/claude-bridge/tests/session-bridge.test.ts` (current: 197 lines)
- `packages/sdk-core/src/managers/SessionManager.ts:245-274` (auto-discovery logic)

**Success Criteria:**
- [ ] All 12 session-bridge tests pass
- [ ] When hostAddress is undefined, `startSession()` config has no `host` key → SDK auto-discovers
- [ ] When hostAddress is defined, `startSession()` config includes `host` → direct connection
- [ ] `src/session-bridge.ts` stays ≤ 150 lines

---

### Sub-phase 9.3: Update CLI Help Text

**Goal**: Update `--host` flag description to indicate it's optional.

**Line Budget**: ≤ 2 modified lines in `src/index.ts`

#### Tasks
- [x] Change `--host` description from `'Host node Ethereum address (or CLAUDE_BRIDGE_HOST)'` → `'Host node address (optional — auto-discovered if omitted)'`
- [x] Verify `node dist/index.js --help` shows updated description
- [x] Verify `pnpm build` compiles cleanly

**Reference Files:**
- `packages/claude-bridge/src/index.ts` (current: 61 lines)

**Success Criteria:**
- [ ] `--help` output shows `--host` as optional
- [ ] Minimal usage: `fabstir-claude-bridge --private-key <key> --model <name>`
- [ ] `src/index.ts` stays ≤ 62 lines

---

### Sub-phase 9.4: Full Regression

**Goal**: Verify all existing tests still pass after the changes.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [x] Run `cd packages/claude-bridge && npx vitest run` — all tests pass
- [x] Run `cd packages/claude-bridge && pnpm build` — TypeScript compiles cleanly
- [x] Run `node dist/index.js --help` — verify `--host` shows as optional

**Success Criteria:**
- [x] All tests pass (73 existing + 3 new = 76 total)
- [x] Build succeeds
- [x] CLI help is accurate

---

## File Summary

| File | Max Lines | Purpose |
|------|-----------|---------|
| `src/types.ts` | 140 | Anthropic API request/response types + tool_use types |
| `src/config.ts` | 80 | CLI config, defaults, validation |
| `src/converter.ts` | 110 | Messages → ChatML + image extraction + tool prompt injection |
| `src/sse.ts` | 100 | SSE event builder functions (text + tool_use) |
| `src/session-bridge.ts` | 150 | SDK lifecycle, session management, request queue |
| `src/handler.ts` | 200 | HTTP request handlers (streaming + non-streaming + tool use) |
| `src/tool-parser.ts` | 80 | Streaming `<tool_call>` tag state machine |
| `src/server.ts` | 100 | Native Node.js HTTP server + routing |
| `src/index.ts` | 60 | CLI entry point (Commander) |
| **Total source** | **≤ 1020** | |

| Test File | ~Lines | Tests |
|-----------|--------|-------|
| `tests/types.test.ts` | 140 | 13 |
| `tests/config.test.ts` | 60 | 7 |
| `tests/converter.test.ts` | 175 | 15 |
| `tests/sse.test.ts` | 170 | 12 |
| `tests/session-bridge.test.ts` | 120 | 10 |
| `tests/handler.test.ts` | 360 | 22 |
| `tests/server.test.ts` | 90 | 8 |
| `tests/tool-parser.test.ts` | 160 | 12 |
| `tests/integration/bridge-flow.test.ts` | 230 | 10 |
| **Total tests** | **~1505** | **109** |

---

## Execution Order

| Step | Sub-phase | Dependencies | Status |
|------|-----------|-------------|--------|
| 1 | 1.1 Package Infrastructure | None | Done |
| 2 | 1.2 Anthropic API Types | 1.1 | Done |
| 3 | 1.3 Bridge Configuration | 1.1 | Done |
| 4 | 2.1 Message Converter | 1.2 (types) | Done |
| 5 | 3.1 SSE Event Builder | 1.2 (types) | Done |
| 6 | 4.1 Session Bridge | 1.3 (config) | Done |
| 7 | 5.1 Handler Non-Streaming | 2.1 (converter), 4.1 (session bridge) | Done |
| 8 | 5.2 Handler Streaming | 3.1 (sse), 5.1 (handler) | Done |
| 9 | 6.1 HTTP Server | 5.2 (handler) | Done |
| 10 | 7.1 CLI Entry Point | 4.1 (session bridge), 6.1 (server) | Done |
| 11 | 8.1 Integration Tests | All above | Done |
| 12 | 9.1 Config: hostAddress optional | 1.3 (config) | |
| 13 | 9.2 Session Bridge: conditional host | 4.1 (session bridge), 9.1 | |
| 14 | 9.3 CLI: update help text | 7.1 (CLI), 9.1 | |
| 15 | 9.4 Full regression | 9.1, 9.2, 9.3 | |
| 16 | 10.1 Types + SSE builders for tool_use | 1.2 (types), 3.1 (sse) | |
| 17 | 10.2 Tool prompt injection | 10.1 (types), 2.1 (converter) | |
| 18 | 10.3 Streaming tool call parser | None (standalone) | |
| 19 | 10.4 Handler integration | 10.1, 10.2, 10.3 | |
| 20 | 10.5 End-to-end tool use tests | All Phase 10 above | |

---

## Verification

### Unit Tests
```bash
cd packages/claude-bridge && pnpm test
```

### Manual Test (non-streaming)
```bash
# Terminal 1: Start bridge (host auto-discovered from NodeRegistry)
fabstir-claude-bridge \
  --env-file /workspace/.env.test \
  --private-key "$TEST_USER_1_PRIVATE_KEY" \
  --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

# Or with explicit host (optional override):
# fabstir-claude-bridge ... --host "$TEST_HOST_1_ADDRESS"

# Terminal 2: Curl test
curl -X POST http://localhost:3456/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: test" \
  -d '{"model":"glm-4","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

### Manual Test (streaming)
```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "content-type: application/json" \
  -d '{"model":"glm-4","max_tokens":100,"messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

### Claude Code Integration
```bash
ANTHROPIC_BASE_URL=http://localhost:3456 claude
```

---

## Progress Tracker

- [x] Phase 1: Package Setup & Types (Sub-phases 1.1, 1.2, 1.3) — 73 tests passing
- [x] Phase 2: Message Conversion (Sub-phase 2.1)
- [x] Phase 3: SSE Event Builder (Sub-phase 3.1)
- [x] Phase 4: Session Bridge (Sub-phase 4.1)
- [x] Phase 5: HTTP Request Handler (Sub-phases 5.1, 5.2)
- [x] Phase 6: HTTP Server (Sub-phase 6.1)
- [x] Phase 7: CLI Entry Point (Sub-phase 7.1)
- [x] Phase 8: Integration Testing (Sub-phase 8.1)
- [x] Phase 9: Anonymous Host Discovery (Sub-phases 9.1, 9.2, 9.3, 9.4, 9.5) — 76 tests passing
- [x] Phase 10: Tool Use Support (Sub-phases 10.1, 10.2, 10.3, 10.4, 10.5) — 114 tests passing

---

### Sub-phase 9.5: Root-Level Script for Workspace Execution

**Goal**: Make `fabstir-claude-bridge` runnable from workspace root via `pnpm claude-bridge`.

**Problem**: pnpm workspace doesn't auto-link `bin` entries from local packages to root `node_modules/.bin/`, so the `fabstir-claude-bridge` command is not on PATH.

**Fix**: Add a `claude-bridge` script to `/workspace/package.json` that invokes the bin file directly.

#### Tasks
- [x] Add `"claude-bridge": "node ./packages/claude-bridge/bin/claude-bridge"` to root `package.json` scripts
- [x] Verify `pnpm claude-bridge -- --help` shows CLI options
- [x] Verify `cd packages/claude-bridge && npx vitest run` — all tests still pass

#### Usage
```bash
# From workspace root:
pnpm claude-bridge -- --private-key "$MY_PRIVATE_KEY" --model "org/model:file.gguf"

# Or directly:
node ./packages/claude-bridge/bin/claude-bridge --private-key "$MY_PRIVATE_KEY" --model "org/model:file.gguf"
```

**Success Criteria:**
- [x] `pnpm claude-bridge -- --help` shows all CLI options
- [x] All existing tests pass

---

## Phase 10: Tool Use Support (Function Calling)

### Motivation

Claude Code relies on **tool use** (function calling) for its agentic capabilities — reading files, writing code, running commands. When the bridge returns only text, Claude Code gives instructions instead of acting. The GLM-4.7-Flash model supports tool calling natively using `<tool_call>` XML tags, and Ollama already translates these for Claude Code. The bridge needs the same translation layer.

**How it works:**
1. Claude Code sends `POST /v1/messages` with a `tools[]` array defining available tools
2. The bridge injects tool definitions into the system prompt using GLM-4's native format
3. The model outputs `<tool_call>{"name":"...", "arguments":{...}}</tool_call>` tags
4. The bridge parses these tags and emits Anthropic `tool_use` SSE content blocks
5. Claude Code executes the tool locally and sends back `tool_result` in the next request
6. The converter serializes `tool_result` into the ChatML prompt (already works from Phase 2)

**Architecture:**
```
Claude Code request (tools[]) ──> converter.ts: inject tools into system prompt
                                                 ↓
                                  session-bridge.ts: send to model (unchanged)
                                                 ↓
                              handler.ts: stream tokens through ToolCallParser
                                                 ↓
                        tool-parser.ts: state machine detects <tool_call> boundaries
                                                 ↓
                              sse.ts: emit tool_use content blocks + input_json_delta
                                                 ↓
                              Claude Code receives tool_use → executes tool locally
                                                 ↓
                              Next request: tool_result in messages → converter handles
```

**Key Anthropic Formats:**

*Request — tool definition:*
```json
{ "name": "get_weather", "description": "Get weather info", "input_schema": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] } }
```

*Response — tool_use SSE events (streaming):*
```
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_abc","name":"get_weather"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"city\":\"London\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":42}}
```

*Response — tool_use content block (non-streaming):*
```json
{ "type": "tool_use", "id": "toolu_abc", "name": "get_weather", "input": { "city": "London" } }
```

*GLM-4 native output (what model produces):*
```
<tool_call>
{"name": "get_weather", "arguments": {"city": "London"}}
</tool_call>
```

---

### Sub-phase 10.1: Types + SSE Builders for Tool Use

**Goal**: Add `tools` field to `AnthropicRequest`, tool_use response types, and SSE builder functions for `tool_use` content blocks and `input_json_delta` deltas.

**Line Budget**: +22 lines `src/types.ts` (≤ 140 total), +21 lines `src/sse.ts` (≤ 100 total)

#### Tasks

**`src/types.ts`:**
- [x] Define `AnthropicTool` interface: `{ name: string; description: string; input_schema: Record<string, any> }`
- [x] Add `tools?: AnthropicTool[]` to `AnthropicRequest`
- [x] Define `ToolUseResponseBlock` interface: `{ type: 'tool_use'; id: string; name: string; input: any }`
- [x] Widen `ResponseBlock` to union: `TextResponseBlock | ToolUseResponseBlock`
- [x] Widen `ContentBlockStartData.content_block` to accept `{ type: 'tool_use'; id: string; name: string }`
- [x] Widen `ContentBlockDeltaData.delta` to accept `{ type: 'input_json_delta'; partial_json: string }`

**`src/sse.ts`:**
- [x] Implement `generateToolUseId(): string` — returns `"toolu_" + randomUUID()`
- [x] Implement `buildToolUseBlockStart(index: number, id: string, name: string): string` — SSE with `content_block: { type: 'tool_use', id, name }`
- [x] Implement `buildInputJsonDelta(index: number, partialJson: string): string` — SSE with `delta: { type: 'input_json_delta', partial_json }`

**Tests:**
- [x] Write 4 tests in `tests/types.test.ts`
- [x] Write 4 tests in `tests/sse.test.ts`
- [x] Verify all tests pass

**Test File:** `tests/types.test.ts` (+36 lines)

**Tests (4 new):**
1. [x] `AnthropicRequest accepts optional tools array` — verify a request with `tools: [{ name, description, input_schema }]` has the expected shape
2. [x] `AnthropicTool has name, description, input_schema fields` — verify type structure
3. [x] `ToolUseResponseBlock has type "tool_use", id, name, input` — verify type structure
4. [x] `ContentBlockDeltaData supports input_json_delta type` — verify delta can be `{ type: 'input_json_delta', partial_json: string }`

**Test File:** `tests/sse.test.ts` (+40 lines)

**Tests (4 new):**
5. [x] `generateToolUseId returns string starting with "toolu_"` — verify format and uniqueness
6. [x] `buildToolUseBlockStart produces content_block_start with tool_use type, id, and name` — parse SSE, verify `data.content_block` is `{ type: 'tool_use', id: 'toolu_abc', name: 'get_weather' }`
7. [x] `buildInputJsonDelta produces content_block_delta with input_json_delta type` — parse SSE, verify `data.delta` is `{ type: 'input_json_delta', partial_json: '{"city":' }`
8. [x] `buildMessageDelta with stop_reason "tool_use" works` — verify `buildMessageDelta('tool_use', N)` produces correct output (documents existing function for tool_use case)

**Success Criteria:**
- [x] All existing 76 tests still pass
- [x] 8 new tests pass (total: 84)
- [x] TypeScript compiles cleanly
- [x] `src/types.ts` ≤ 140 lines (actual: 138)
- [x] `src/sse.ts` ≤ 100 lines (actual: 89)

---

### Sub-phase 10.2: Tool Prompt Injection

**Goal**: When `AnthropicRequest.tools` is present, inject tool definitions into the system prompt so the model produces `<tool_call>` output.

**Line Budget**: +30 lines `src/converter.ts` (≤ 110 total)

#### Tasks

**`src/converter.ts`:**
- [x] Change `convertMessages` signature: `convertMessages(messages, system?, tools?)`
- [x] Implement `formatToolsForPrompt(tools: AnthropicTool[]): string` helper that produces:
  ```
  You have access to the following tools. When you want to use a tool, output ONLY a tool call in exactly this format with no other text:
  <tool_call>
  {"name": "tool_name", "arguments": {"param": "value"}}
  </tool_call>

  Available tools:
  - tool_name: description
    Parameters: { JSON schema summary }
  ```
- [x] When `tools` is non-empty, prepend tool injection text to system prompt content
- [x] When `tools` is empty or undefined, no change to existing behavior

**Tests:**
- [x] Write 5 tests in `tests/converter.test.ts`
- [x] Verify all tests pass

**Test File:** `tests/converter.test.ts` (+64 lines)

**Tests (5 new):**
1. [x] `convertMessages with tools injects tool definitions into system prompt` — call with one tool, verify prompt contains tool name, description, and parameter schema in system section
2. [x] `convertMessages with tools includes instruction to use <tool_call> format` — verify injected text contains `<tool_call>` and `</tool_call>` as instruction
3. [x] `convertMessages with tools preserves existing system prompt` — when both `system` and `tools` provided, verify both original system text and tool definitions appear
4. [x] `convertMessages with empty tools array produces no tool injection` — output identical to no tools
5. [x] `convertMessages with multiple tools includes all tool definitions` — verify all tool names appear

**Success Criteria:**
- [x] All existing converter tests still pass (backward compatible)
- [x] 5 new tests pass (total: 89)
- [x] `src/converter.ts` ≤ 110 lines (actual: 100)

---

### Sub-phase 10.3: Streaming Tool Call Parser

**Goal**: Create a new `src/tool-parser.ts` module with a streaming state machine that detects `<tool_call>...</tool_call>` boundaries in token streams and emits structured events.

**Line Budget**: ≤ 80 lines `src/tool-parser.ts` (new file)

#### Tasks

**`src/tool-parser.ts`:**
- [x] Define `ParserEvent` type union:
  - `{ type: 'text'; text: string }` — normal text output
  - `{ type: 'tool_call'; name: string; arguments: Record<string, any> }` — parsed tool call
  - `{ type: 'error'; rawContent: string }` — malformed tool call (graceful degradation)
- [x] Implement `ToolCallParser` class with:
  - `private buffer: string` — accumulates characters
  - `private state: 'text' | 'maybe_tag' | 'in_tool_call'` — current parser state
  - `feed(token: string): ParserEvent[]` — process a token, return events to emit
  - `flush(): ParserEvent[]` — emit any remaining buffered content as text
  - `reset(): void` — clear all state

**State machine:**
- **`text`**: Accumulate characters. On `<` → switch to `maybe_tag`, start buffering from `<`
- **`maybe_tag`**: Continue buffering. Compare against `<tool_call>` prefix character-by-character:
  - If buffer matches full `<tool_call>` → switch to `in_tool_call`
  - If buffer length exceeds `<tool_call>` length without match → flush buffer as text, back to `text`
  - If next char proves mismatch (e.g., `<tools` vs `<tool_`) → flush buffer as text, back to `text`
- **`in_tool_call`**: Buffer everything. Check for `</tool_call>` on each token:
  - Found → extract content between tags, `JSON.parse(content.trim())`, extract `name` and `arguments` (accept `parameters` as alias for `arguments`), emit `tool_call` event, back to `text`
  - Malformed JSON → emit `error` event with raw content, back to `text`

**Tests:**
- [x] Write 12 tests in `tests/tool-parser.test.ts` (new file)
- [x] Verify all tests pass

**Test File:** `tests/tool-parser.test.ts` (~160 lines, new file)

**Tests (12 new):**
1. [x] `emits text tokens unchanged when no tool_call present` — feed "Hello world" token by token, verify all text events emitted
2. [x] `detects complete tool_call in a single token` — feed entire `<tool_call>\n{"name":"get_weather","arguments":{"city":"London"}}\n</tool_call>`, verify `tool_call` event
3. [x] `detects tool_call split across multiple tokens` — feed `<tool`, `_call>`, `\n{"name":"read_file"`, `,
"arguments":{"path":"/tmp"}}`, `\n</tool_call>`, verify single `tool_call` event
4. [x] `emits text before tool_call, then tool_call event` — feed "Let me read that. " then `<tool_call>...`, verify text events first, then tool_call
5. [x] `emits text after tool_call` — feed `<tool_call>...</tool_call>` then " Done.", verify tool_call then text
6. [x] `handles multiple tool_calls in sequence` — two consecutive `<tool_call>...</tool_call>` blocks, verify two tool_call events
7. [x] `buffers partial < and flushes if not tool_call` — feed "x < y" as tokens, verify all emitted as text
8. [x] `buffers partial <tool and flushes if not matching` — feed `<tool`, then `s are useful`, verify all flushed as text
9. [x] `handles malformed JSON inside tool_call tags gracefully` — feed `<tool_call>\nnot valid json\n</tool_call>`, verify `error` event with raw content
10. [x] `accepts "arguments" or "parameters" key` — feed tool_call with `"parameters"` key, verify parsed `tool_call` event normalizes to `arguments`
11. [x] `reset() clears all state` — feed partial `<tool_call>`, call `reset()`, feed normal text, verify no leftover state
12. [x] `flush() emits any buffered content as text` — feed `<tool` then call `flush()`, verify `<tool` emitted as text

**Success Criteria:**
- [x] All 12 parser tests pass
- [x] Parser handles edge cases (partial tokens, false starts, malformed JSON)
- [x] `src/tool-parser.ts` ≤ 80 lines (actual: 81)

---

### Sub-phase 10.4: Handler Integration

**Goal**: Wire `ToolCallParser` into `handleStreaming()` and `handleNonStreaming()` so tool calls in model output are emitted as Anthropic `tool_use` SSE events / response blocks.

**Line Budget**: +55 lines `src/handler.ts` (≤ 200 total)

#### Tasks

**`src/handler.ts` — `handleMessages()`:**
- [x] Pass `body.tools` to `convertMessages()` as third argument
- [x] Pass `body.tools` to both `handleStreaming()` and `handleNonStreaming()`

**`src/handler.ts` — `handleStreaming()`:**
- [x] Accept `tools?: AnthropicTool[]` parameter
- [x] When `tools` present and non-empty: create `ToolCallParser` instance
- [x] Track `currentBlockIndex` (starts at 0) and `hasToolUse` flag
- [x] Replace direct `onToken` callback with parser-based flow:
  - `parser.feed(token)` → iterate returned events:
    - `TextEvent` → emit `buildContentBlockDelta(currentBlockIndex, text)`
    - `ToolCallEvent` →
      1. Close current text block: `buildContentBlockStop(currentBlockIndex)`
      2. Open tool_use block: `buildToolUseBlockStart(++currentBlockIndex, generateToolUseId(), name)`
      3. Emit JSON input: `buildInputJsonDelta(currentBlockIndex, JSON.stringify(arguments))`
      4. Close tool_use block: `buildContentBlockStop(currentBlockIndex)`
      5. Set `hasToolUse = true`
      6. Open new text block: `buildContentBlockStart(++currentBlockIndex)` (in case text follows)
    - `ErrorEvent` → emit raw content as text_delta (graceful degradation)
- [x] After streaming completes: call `parser.flush()` and process any remaining events
- [x] Use `hasToolUse ? 'tool_use' : 'end_turn'` as stop_reason in `buildMessageDelta()`
- [x] When `tools` is empty/undefined: bypass parser entirely (existing direct passthrough, backward compatible)

**`src/handler.ts` — `handleNonStreaming()`:**
- [x] Accept `tools?: AnthropicTool[]` parameter
- [x] When `tools` present and non-empty:
  1. Create `ToolCallParser`, feed entire response, call `flush()`
  2. Build `content[]` array from parser events:
     - `TextEvent` → `{ type: 'text', text }`
     - `ToolCallEvent` → `{ type: 'tool_use', id: generateToolUseId(), name, input: arguments }`
     - `ErrorEvent` → `{ type: 'text', text: rawContent }` (graceful degradation)
  3. Set `stop_reason` to `'tool_use'` if any tool calls, else `'end_turn'`
- [x] When `tools` is empty/undefined: existing behavior (single text block)

**Tests:**
- [x] Write 8 tests in `tests/handler.test.ts`
- [x] Verify all tests pass

**Test File:** `tests/handler.test.ts` (+112 lines)

**Tests (8 new):**
1. [x] `streaming: tool_call in output produces tool_use content block` — mock bridge emits tokens with `<tool_call>...</tool_call>`, verify SSE contains `content_block_start` with `type: "tool_use"` and `content_block_delta` with `type: "input_json_delta"`
2. [x] `streaming: text before tool_call emitted as text block, then tool_use block` — mock bridge emits text then tool_call, verify two content blocks at sequential indices
3. [x] `streaming: stop_reason is "tool_use" when tool calls detected` — verify `message_delta` has `stop_reason: "tool_use"`
4. [x] `streaming: no tools in request still works unchanged (backward compat)` — no tools, plain text, verify identical to existing behavior
5. [x] `streaming: tool_use id starts with "toolu_"` — verify id field format
6. [x] `streaming: multiple tool_calls produce multiple tool_use blocks` — two consecutive tool_calls, verify two `tool_use` content blocks
7. [x] `non-streaming: tool_call in response produces tool_use in response body` — mock bridge returns text with `<tool_call>...</tool_call>`, verify JSON `content` array has `{ type: "tool_use", id, name, input }`
8. [x] `non-streaming: stop_reason is "tool_use" when tool calls detected` — verify `stop_reason: "tool_use"`

**Success Criteria:**
- [x] All existing 14 handler tests still pass (backward compatibility)
- [x] 8 new tests pass (total: 22 handler tests)
- [x] `src/handler.ts` ≤ 200 lines (actual: 190)

---

### Sub-phase 10.5: End-to-End Tool Use Integration Tests

**Goal**: Verify the complete tool use flow end-to-end through the HTTP server, including multi-turn conversations with tool_result messages.

**Line Budget**: 0 source lines (tests only, +96 lines in test file)

#### Tasks

- [x] Write 5 tests in `tests/integration/bridge-flow.test.ts`
- [x] Verify all tests pass

**Test File:** `tests/integration/bridge-flow.test.ts` (+96 lines)

**Tests (5 new):**
1. [x] `streaming: request with tools produces tool_use SSE events` — full HTTP request with `tools[]` and `stream: true`, mock bridge emits tokens with `<tool_call>`, verify SSE stream contains `tool_use` content blocks and `stop_reason: "tool_use"`
2. [x] `non-streaming: request with tools produces tool_use in response body` — full HTTP request with `tools[]` and `stream: false`, mock bridge returns text with `<tool_call>`, verify JSON response has `tool_use` content block
3. [x] `multi-turn: tool_result messages serialized correctly in ChatML prompt` — send request with message history containing `tool_use` (from assistant) and `tool_result` (from user), verify ChatML prompt includes serialized tool use and result text
4. [x] `tools in request inject definitions into system prompt` — send request with `tools[]`, verify the prompt passed to `bridge.sendPrompt` contains tool definitions in system section
5. [x] `request without tools (backward compat) still works` — send request with no `tools` field, verify normal text response (regression test)

**Success Criteria:**
- [x] All existing 5 integration tests still pass
- [x] 5 new tests pass (total: 10 integration tests)
- [x] All 114 tests pass across entire package

---

### Phase 10 Summary

| Sub-phase | New Tests | Files Modified | New File | Line Delta |
|-----------|-----------|----------------|----------|------------|
| 10.1 Types + SSE builders | 8 | `types.ts` (+22), `sse.ts` (+21) | — | +43 source |
| 10.2 Tool prompt injection | 5 | `converter.ts` (+30) | — | +30 source |
| 10.3 Tool call parser | 12 | — | `tool-parser.ts` (~80) | +80 source |
| 10.4 Handler integration | 8 | `handler.ts` (+55) | — | +55 source |
| 10.5 E2E integration tests | 5 | integration test (+96) | — | +0 source |
| **Total** | **38** | **4 modified** | **1 new** | **+208 source, +348 test** |

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Model doesn't produce `<tool_call>` tags reliably | Prompt injection is explicit with examples; GLM-4 was trained on this format natively; parser gracefully degrades to text for unrecognized output |
| Partial token boundaries split mid-tag | `maybe_tag` state buffers partial matches; `flush()` handles end-of-stream cleanup |
| Tool call JSON contains `</tool_call>` in string values | Extremely unlikely for model-generated JSON; simple `indexOf` sufficient for MVP |
| Content block index management complexity | Simple `currentBlockIndex` counter; bypass parser entirely when no tools in request |
| Backward compatibility regression | When no `tools` in request, handler uses existing direct-passthrough logic; every sub-phase includes backward compat tests |

### Verification (after all Phase 10 sub-phases)

```bash
# Run all tests
cd /workspace/packages/claude-bridge && pnpm test

# Rebuild
cd /workspace/packages/sdk-core && pnpm build:esm && pnpm build:cjs
cd /workspace/packages/claude-bridge && pnpm build

# Start bridge
export CLAUDE_BRIDGE_LOCALHOST_OVERRIDE=host.docker.internal
pnpm claude-bridge -- --private-key "$MY_PRIVATE_KEY" --model "unsloth/GLM-4.7-Flash-GGUF:GLM-4.7-Flash-UD-Q8_K_XL.gguf"

# In hello-world1: Claude Code should now use tools
ANTHROPIC_BASE_URL=http://sdk-dev:3456 claude
# Ask: "Create me a React app that displays hello world"
# Expected: Claude Code creates files using Write/Bash tools instead of giving text instructions
```
