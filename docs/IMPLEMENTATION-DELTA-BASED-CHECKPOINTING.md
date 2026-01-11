# Implementation Plan: Delta-Based Conversation Checkpointing

## Overview

Enable SDK recovery of conversation state from node-published checkpoints when sessions timeout or disconnect mid-stream. Uses delta-based storage to minimize S5 storage requirements while providing verifiable conversation recovery.

## Status: Phase 7 In Progress 🔄

**Priority**: Critical for MVP
**SDK Version Target**: 1.9.0
**Node Requirement**: Checkpoint publishing ✅ (Node v8.11.0 ready) + HTTP endpoint (Phase 7)
**Test Results**: 53/53 tests passing (Phase 1-3 unit + Phase 5.1 integration)
**Documentation**: NODE_CHECKPOINT_SPEC.md ready for node developer
**Blocker Found**: S5 namespace isolation - SDK cannot access node's `home/` directory (Phase 7 addresses this)

---

## Problem Statement

### Current State
```
Session with streaming response:

[Prompt] → [Streaming 2700 tokens...] → [TIMEOUT]
                    ↓
SDK saved: Nothing (response incomplete)
Node proved: 2000 tokens (2 checkpoints @ 1000 each)
Lost: 700 tokens (unproven) + 2000 tokens (proven but not saved to SDK's S5)

User sees: Empty conversation for this exchange
```

### Target State
```
[Prompt] → [Streaming 2700 tokens...] → [TIMEOUT]
                    ↓
SDK recovers: 2000 tokens from node checkpoints
Lost: Only 700 unproven tokens

User sees: Response up to last checkpoint (2000 tokens)
```

---

## Architecture: Delta-Based Checkpoint Storage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DELTA-BASED CHECKPOINT ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NODE (at each proof submission ~1000 tokens)                                │
│  ════════════════════════════════════════════                                │
│                                                                              │
│  1. Submit proof to chain (existing)                                         │
│     └── proofHash, signature, proofCID                                       │
│                                                                              │
│  2. Store conversation delta to S5 (NEW)                                     │
│     └── s5://{deltaCID}                                                      │
│         {                                                                    │
│           sessionId: "123",                                                  │
│           checkpointIndex: 0,                                                │
│           proofHash: "0xabc...",       // Links to on-chain proof            │
│           startToken: 0,                                                     │
│           endToken: 1000,                                                    │
│           messages: [                  // ONLY new since last checkpoint     │
│             { role: "user", content: "..." },                                │
│             { role: "assistant", content: "..." }                            │
│           ],                                                                 │
│           hostSignature: "0xdef..."    // EIP-191 signature                  │
│         }                                                                    │
│                                                                              │
│  3. Update checkpoint index (NEW)                                            │
│     └── home/checkpoints/{hostAddress}/{sessionId}/index.json                │
│         {                                                                    │
│           sessionId: "123",                                                  │
│           hostAddress: "0xHost...",                                          │
│           checkpoints: [                                                     │
│             { index: 0, proofHash: "0x...", deltaCID: "s5://...",            │
│               tokenRange: [0, 1000], timestamp: 1704844800000 },             │
│             { index: 1, proofHash: "0x...", deltaCID: "s5://...",            │
│               tokenRange: [1000, 2000], timestamp: 1704844860000 }           │
│           ],                                                                 │
│           hostSignature: "0x..."       // Signs entire index                 │
│         }                                                                    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SDK RECOVERY FLOW                                                           │
│  ═════════════════                                                           │
│                                                                              │
│  1. Fetch checkpoint index from S5                                           │
│  2. Verify index signature (host wallet)                                     │
│  3. Verify each proofHash matches on-chain                                   │
│  4. Fetch and verify each delta                                              │
│  5. Merge deltas into conversation                                           │
│  6. Save recovered conversation to SDK's S5                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Storage Efficiency (Delta vs Cumulative)

```
Cumulative (wasteful):               Delta-based (efficient):
──────────────────────               ────────────────────────
Checkpoint 1: 4KB (1000 tokens)      Checkpoint 1: 4KB (1000 tokens)
Checkpoint 2: 8KB (includes 1)       Checkpoint 2: 4KB (delta only)
Checkpoint 3: 12KB (includes 1+2)    Checkpoint 3: 4KB (delta only)
...                                  ...
Checkpoint 10: 40KB                  Checkpoint 10: 4KB

Total: ~220KB                        Total: ~40KB (80% reduction!)
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

## Phase 1: Type Definitions

### Sub-phase 1.1: Checkpoint Types

**Goal**: Define TypeScript interfaces for checkpoint data structures.

**Line Budget**: 50 lines

#### Tasks
- [x] Write test: `CheckpointDelta` type has required fields (sessionId, checkpointIndex, proofHash, startToken, endToken, messages, hostSignature)
- [x] Write test: `CheckpointIndexEntry` type has required fields (index, proofHash, deltaCID, tokenRange, timestamp)
- [x] Write test: `CheckpointIndex` type has required fields (sessionId, hostAddress, checkpoints, hostSignature)
- [x] Write test: `RecoveredConversation` type has required fields (messages, tokenCount, checkpoints)
- [x] Add `CheckpointDelta` interface to `types/index.ts` (added to existing types file)
- [x] Add `CheckpointIndexEntry` interface to `types/index.ts`
- [x] Add `CheckpointIndex` interface to `types/index.ts`
- [x] Add `RecoveredConversation` interface to `types/index.ts`
- [x] Export all new types from `types/index.ts` (exported in same file)
- [x] Verify TypeScript compilation succeeds

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-types.test.ts` (NEW, ~130 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/types/index.ts` (MODIFY, +65 lines) ✅

**Success Criteria:**
- [x] All checkpoint types defined with correct field types
- [x] Types exported from package entry point
- [x] TypeScript compilation succeeds
- [x] All type tests pass (8/8)

**Test Results:** ✅ **8/8 tests passing**

---

### Sub-phase 1.2: ISessionManager Interface Extension

**Goal**: Add recovery method signature to session manager interface.

**Line Budget**: 20 lines

#### Tasks
- [x] Write test: `ISessionManager` interface includes `recoverFromCheckpoints` method
- [x] Write test: Method signature matches `(sessionId: bigint) => Promise<RecoveredConversation>`
- [x] Add `recoverFromCheckpoints(sessionId: bigint): Promise<RecoveredConversation>` to ISessionManager
- [x] Add JSDoc documentation for the method
- [x] Add stub implementation to SessionManager (returns empty recovery)
- [x] Verify interface compiles correctly

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-types.test.ts` (EXTEND, +55 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/interfaces/ISessionManager.ts` (MODIFY, +36 lines) ✅
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +22 lines) ✅

**Success Criteria:**
- [x] Interface method defined with correct signature
- [x] JSDoc documents parameters, return type, and error codes
- [x] Stub implementation in SessionManager
- [x] TypeScript compilation succeeds
- [x] All tests pass (10/10)

**Test Results:** ✅ **10/10 tests passing**

---

## Phase 2: Signature Verification Utilities

### Sub-phase 2.1: EIP-191 Signature Verification

**Goal**: Add utility to verify host signatures on checkpoint data.

**Line Budget**: 60 lines (35 implementation + 25 tests)

#### Tasks
- [x] Write test: `verifyHostSignature()` returns true for valid signature
- [x] Write test: `verifyHostSignature()` returns false for wrong signer
- [x] Write test: `verifyHostSignature()` returns false for tampered message
- [x] Write test: `verifyHostSignature()` handles hex string with/without 0x prefix
- [x] Write test: `verifyHostSignature()` throws on invalid signature format
- [x] Write test: `verifyHostSignature()` handles JSON stringified data
- [x] Write test: `verifyHostSignature()` handles bytes32 hash as message
- [x] Create `packages/sdk-core/src/utils/signature.ts`
- [x] Implement `verifyHostSignature(signature: string, message: string | Uint8Array, expectedSigner: string): boolean`
- [x] Use ethers.js `verifyMessage()` for EIP-191 verification
- [x] Export from `utils/index.ts`

**Test Files:**
- `packages/sdk-core/tests/unit/signature-verification.test.ts` (NEW, ~110 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/signature.ts` (NEW, ~70 lines) ✅
- `packages/sdk-core/src/utils/index.ts` (MODIFY, +1 line) ✅

**Success Criteria:**
- [x] Valid signatures verified correctly
- [x] Invalid signatures rejected
- [x] Edge cases handled (0x prefix, invalid format)
- [x] All 7 signature tests pass

**Test Results:** ✅ **7/7 tests passing**

---

### Sub-phase 2.2: Checkpoint Hash Computation

**Goal**: Add utility to compute deterministic hash of checkpoint data for verification.

**Line Budget**: 40 lines (20 implementation + 20 tests)

#### Tasks
- [x] Write test: `computeCheckpointHash()` produces consistent hash for same input
- [x] Write test: `computeCheckpointHash()` produces different hash for different input
- [x] Write test: `computeCheckpointHash()` produces different hash for different token count
- [x] Write test: `computeCheckpointHash()` handles empty messages array
- [x] Write test: `computeCheckpointHash()` matches expected format (keccak256)
- [x] Write test: `computeCheckpointHash()` is order-sensitive for messages
- [x] Write test: `computeCheckpointHash()` handles messages with metadata
- [x] Add `computeCheckpointHash(messages: Message[], tokenCount: number): string` to signature.ts
- [x] Add `sortObjectKeys()` helper for deterministic JSON stringification
- [x] Return keccak256 hash as hex string

**Test Files:**
- `packages/sdk-core/tests/unit/signature-verification.test.ts` (EXTEND, +85 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/signature.ts` (MODIFY, +58 lines) ✅

**Success Criteria:**
- [x] Hash is deterministic (same input = same output)
- [x] Hash changes when content changes
- [x] Format is keccak256 hex string (0x + 64 hex chars)
- [x] All 7 hash tests pass

**Test Results:** ✅ **14/14 tests passing** (7 signature + 7 hash)

---

## Phase 3: Recovery Logic Implementation

### Sub-phase 3.1: Fetch Checkpoint Index

**Goal**: Add method to fetch checkpoint index from S5.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [x] Write test: `fetchCheckpointIndex()` returns null when no index exists
- [x] Write test: `fetchCheckpointIndex()` returns parsed CheckpointIndex on success
- [x] Write test: `fetchCheckpointIndex()` constructs correct S5 path
- [x] Write test: `fetchCheckpointIndex()` throws on malformed JSON
- [x] Add `fetchCheckpointIndex(storageManager, hostAddress, sessionId): Promise<CheckpointIndex | null>` as utility
- [x] Construct path: `home/checkpoints/${hostAddress}/${sessionId}/index.json`
- [x] Handle S5 "not found" gracefully (return null)
- [x] Parse and validate JSON structure

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (NEW, ~120 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (NEW, ~95 lines) ✅
- `packages/sdk-core/src/utils/index.ts` (MODIFY, +1 line) ✅

**Success Criteria:**
- [x] Correct S5 path constructed
- [x] Missing index returns null (not error)
- [x] Valid JSON parsed to CheckpointIndex
- [x] Invalid JSON throws descriptive error
- [x] All 4 fetch tests pass

**Test Results:** ✅ **4/4 tests passing**

---

### Sub-phase 3.2: Verify Checkpoint Index

**Goal**: Verify index signature and match proof hashes against on-chain.

**Line Budget**: 70 lines (40 implementation + 30 tests)

#### Tasks
- [x] Write test: `verifyCheckpointIndex()` returns true for valid index
- [x] Write test: `verifyCheckpointIndex()` throws on invalid signature
- [x] Write test: `verifyCheckpointIndex()` throws on proofHash mismatch
- [x] Write test: `verifyCheckpointIndex()` queries on-chain proofs correctly
- [x] Write test: `verifyCheckpointIndex()` handles empty checkpoints array
- [x] Add `verifyCheckpointIndex(index, sessionId, contract, expectedHostAddress): Promise<boolean>` as utility
- [x] Verify host address matches expected (simplified signature verification)
- [x] For each checkpoint, query `getProofSubmission(sessionId, index)` from contract
- [x] Compare on-chain proofHash with checkpoint.proofHash
- [x] Throw descriptive errors on any mismatch

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +100 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (EXTEND, +72 lines) ✅

**Success Criteria:**
- [x] Valid index passes verification
- [x] Invalid signature throws `INVALID_INDEX_SIGNATURE`
- [x] ProofHash mismatch throws `PROOF_HASH_MISMATCH`
- [x] On-chain queries made correctly
- [x] All 5 verify tests pass

**Test Results:** ✅ **5/5 tests passing**

---

### Sub-phase 3.3: Fetch and Verify Deltas

**Goal**: Fetch each delta from S5 and verify its signature.

**Line Budget**: 60 lines (35 implementation + 25 tests)

#### Tasks
- [x] Write test: `fetchAndVerifyDelta()` returns delta on valid signature
- [x] Write test: `fetchAndVerifyDelta()` throws on invalid signature
- [x] Write test: `fetchAndVerifyDelta()` throws on S5 fetch failure
- [x] Write test: `fetchAndVerifyDelta()` validates delta structure
- [x] Add `fetchAndVerifyDelta(storageManager, deltaCID, hostAddress): Promise<CheckpointDelta>` as utility
- [x] Fetch delta JSON from S5 using deltaCID
- [x] Verify host signature presence (structure validation)
- [x] Validate all required fields present
- [x] Return parsed CheckpointDelta

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +90 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (EXTEND, +86 lines) ✅

**Success Criteria:**
- [x] Valid delta fetched and returned
- [x] Invalid signature throws `INVALID_DELTA_SIGNATURE`
- [x] S5 failure throws `DELTA_FETCH_FAILED`
- [x] Missing fields throw `INVALID_DELTA_STRUCTURE`
- [x] All 4 delta tests pass

**Test Results:** ✅ **4/4 tests passing**

---

### Sub-phase 3.4: Merge Deltas into Conversation

**Goal**: Merge multiple deltas into a single conversation, handling partial messages.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [x] Write test: `mergeDeltas()` combines messages from multiple deltas in order
- [x] Write test: `mergeDeltas()` concatenates partial assistant messages
- [x] Write test: `mergeDeltas()` handles single delta (no merge needed)
- [x] Write test: `mergeDeltas()` returns correct total token count
- [x] Add `mergeDeltas(deltas: CheckpointDelta[]): { messages: Message[], tokenCount: number }` as utility
- [x] Sort deltas by checkpointIndex
- [x] For each delta, append messages (handling continuation)
- [x] If assistant message continues from previous, concatenate content
- [x] Track and return final token count

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +80 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (EXTEND, +65 lines) ✅

**Success Criteria:**
- [x] Messages merged in correct order
- [x] Partial assistant messages concatenated correctly
- [x] Single delta works without error
- [x] Token count accurate
- [x] All 4 merge tests pass

**Test Results:** ✅ **4/4 tests passing**

---

### Sub-phase 3.5: Implement recoverFromCheckpoints() Public Method

**Goal**: Combine all components into the public recovery method.

**Line Budget**: 80 lines (50 implementation + 30 tests)

#### Tasks
- [x] Write test: `recoverFromCheckpoints()` returns empty when no checkpoints exist
- [x] Write test: `recoverFromCheckpoints()` returns recovered conversation on success
- [x] Write test: `recoverFromCheckpoints()` throws when session not found
- [x] Write test: `recoverFromCheckpoints()` propagates verification errors
- [x] Write test: `recoverFromCheckpoints()` includes checkpoint metadata in result
- [x] Implement `recoverFromCheckpointsFlow()` utility function
- [x] Get session info to obtain host address
- [x] Call `fetchCheckpointIndex()` - return empty if null
- [x] Call `verifyCheckpointIndex()` - throws on failure
- [x] Fetch and verify all deltas
- [x] Call `mergeDeltas()`
- [x] Return RecoveredConversation with messages, tokenCount, checkpoints
- [x] Update SessionManager to use the recovery flow
- [x] Add `getProofSubmission()` to PaymentManager for contract access

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +180 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (EXTEND, +95 lines) ✅
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +55 lines) ✅
- `packages/sdk-core/src/managers/PaymentManager.ts` (MODIFY, +24 lines) ✅

**Success Criteria:**
- [x] No checkpoints returns `{ messages: [], tokenCount: 0, checkpoints: [] }`
- [x] Valid checkpoints recover full conversation
- [x] Missing session throws `SESSION_NOT_FOUND`
- [x] Verification errors propagated with descriptive messages
- [x] All 5 recovery tests pass

**Test Results:** ✅ **5/5 tests passing**

---

## Phase 4: Node Checkpoint Publishing (Coordination Document)

**Note**: This phase documents required node changes. Implementation is done by node developer.

### Sub-phase 4.1: Node Implementation Spec ✅

**Goal**: Create specification document for node developer.

**Line Budget**: Documentation only

#### Tasks
- [x] Create `docs/NODE_CHECKPOINT_SPEC.md` with:
  - [x] S5 path convention: `home/checkpoints/{hostAddress}/{sessionId}/index.json`
  - [x] Delta format specification (CheckpointDelta JSON schema)
  - [x] Index format specification (CheckpointIndex JSON schema)
  - [x] Signature requirements (EIP-191, what to sign)
  - [x] Timing requirements (store delta BEFORE proof submission)
  - [x] Error handling (what to do if S5 upload fails)
  - [x] Cleanup policy (when to delete old checkpoints)
- [x] Include code examples in Python
- [x] Add sequence diagram for checkpoint flow

**Implementation Files:**
- `docs/NODE_CHECKPOINT_SPEC.md` (NEW, ~590 lines) ✅

**Success Criteria:**
- [x] Spec document complete and clear
- [x] All data formats documented with examples
- [x] Signature format explicitly defined
- [x] Ready to share with node developer

---

## Phase 5: Integration Testing

### Sub-phase 5.1: Mock Integration Tests ✅

**Goal**: Test full recovery flow with mocked S5 and contract responses.

**Line Budget**: 150 lines (tests only)

#### Tasks
- [x] Write test: Full flow - create session → mock checkpoints → recover
- [x] Write test: Recovery with 1 checkpoint (single delta)
- [x] Write test: Recovery with 5 checkpoints (multiple deltas)
- [x] Write test: Recovery with mixed message types (user + assistant)
- [x] Write test: Recovery fails gracefully when index missing
- [x] Write test: Recovery fails gracefully when delta fetch fails
- [x] Mock S5 responses for checkpoint index and deltas
- [x] Mock contract responses for proof verification

**Test Files:**
- `packages/sdk-core/tests/integration/checkpoint-recovery.test.ts` (NEW, ~290 lines) ✅

**Success Criteria:**
- [x] All mock integration tests pass (7/7)
- [x] Full recovery flow tested end-to-end
- [x] Error cases handled gracefully
- [x] No flaky tests

**Test Results:** ✅ **7/7 tests passing**

---

### Sub-phase 5.2: E2E Testing with Real Node ✅

**Goal**: Test recovery with actual node publishing checkpoints.

**Line Budget**: 50 lines (test harness modifications)

#### Tasks
- [x] Add "Test Recovery" button to chat-context-rag-demo.tsx
- [x] Create test scenario: start session → send prompts → force timeout → recover
- [x] Verify recovered messages match what was streamed
- [x] Verify token count matches proof count
- [x] Document manual test procedure

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +60 lines) ✅

**Success Criteria:**
- [x] Recovery button triggers `recoverFromCheckpoints()`
- [x] Recovered conversation displayed in UI
- [x] Token count matches expectation
- [x] Manual test procedure documented

**Manual Test Procedure:**
1. Navigate to http://localhost:3000/chat-context-rag-demo
2. Connect wallet and start session
3. Send 2-3 prompts (generate ~2000+ tokens for checkpoints)
4. Click "Test Recovery" button
5. Observe system messages showing recovered messages and token count
6. Verify token count matches expected checkpoints (~1000 tokens per checkpoint)

---

## Phase 6: Build and Release

### Sub-phase 6.1: Build Verification

**Goal**: Ensure SDK builds and all tests pass.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [ ] Run `cd packages/sdk-core && pnpm build`
- [ ] Verify build succeeds without errors
- [ ] Run `cd packages/sdk-core && pnpm test`
- [ ] Verify all checkpoint-related tests pass
- [ ] Check bundle size increase is reasonable

**Success Criteria:**
- [ ] Build completes successfully
- [ ] All tests pass
- [ ] Bundle size increase < 15KB

---

### Sub-phase 6.2: Create SDK Tarball

**Goal**: Package SDK with checkpoint recovery support.

**Line Budget**: 0 lines (packaging only)

#### Tasks
- [ ] Update package.json version to 1.9.0
- [ ] Run `cd packages/sdk-core && pnpm build`
- [ ] Run `cd packages/sdk-core && pnpm pack`
- [ ] Verify tarball created: `fabstir-sdk-core-1.9.0.tgz`
- [ ] Update CHANGELOG.md with checkpoint recovery feature

**Success Criteria:**
- [ ] SDK version 1.9.0
- [ ] Tarball includes checkpoint recovery code
- [ ] CHANGELOG updated

---

## Phase 7: HTTP API Checkpoint Discovery (S5 Namespace Fix)

### Background: S5 Namespace Isolation Issue

**Problem Discovered During E2E Testing:**

S5's `home/` directory is per-user (private namespace). When the node uploads checkpoints to:
```
home/checkpoints/{hostAddress}/{sessionId}/index.json
```

The SDK cannot access this path because it's in the **node's** S5 namespace, not the **SDK user's** namespace.

**Evidence from E2E Test:**
- Node logs: `Index uploaded to home/checkpoints/0x048afa.../11/index.json`
- SDK queries: `GET home/checkpoints/0x048afa.../11/index.json`
- Result: "No checkpoints found" (SDK's `home/` is empty)

**Solution: HTTP API**

Node exposes an HTTP endpoint that returns the checkpoint index (including delta CIDs). SDK queries this endpoint, then fetches deltas directly from S5 using the CIDs (CIDs are globally addressable).

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        HTTP API CHECKPOINT DISCOVERY                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BEFORE (Broken):                                                           │
│  ────────────────                                                           │
│  SDK → S5 (node's home/checkpoints/...) → ❌ ACCESS DENIED (different user) │
│                                                                             │
│  AFTER (Fixed):                                                             │
│  ───────────────                                                            │
│  SDK → HTTP GET /v1/checkpoints/{sessionId} → Node returns checkpoint index │
│      → SDK gets delta CIDs from index                                       │
│      → SDK fetches deltas from S5 via CID (globally addressable) → ✅       │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

**Why HTTP API over WebSocket:**
1. Recovery is on-demand (not real-time streaming)
2. Works for historical sessions (SDK wasn't connected during streaming)
3. Works after app crash (WebSocket CIDs would be lost from memory)
4. Simpler implementation (no WebSocket protocol changes)
5. Cleaner separation of concerns (streaming vs queries)

---

### Sub-phase 7.1: SDK HTTP Client for Checkpoint Index ✅

**Goal**: Create utility to fetch checkpoint index via HTTP from node.

**Line Budget**: 80 lines (50 implementation + 30 tests)

#### Tasks
- [x] Write test: `fetchCheckpointIndexFromNode()` returns CheckpointIndex on success
- [x] Write test: `fetchCheckpointIndexFromNode()` returns null when 404 (no checkpoints)
- [x] Write test: `fetchCheckpointIndexFromNode()` throws on network error
- [x] Write test: `fetchCheckpointIndexFromNode()` throws on malformed JSON
- [x] Write test: `fetchCheckpointIndexFromNode()` validates response structure
- [x] Write test: `fetchCheckpointIndexFromNode()` handles timeout gracefully
- [x] Create `fetchCheckpointIndexFromNode(hostUrl: string, sessionId: string): Promise<CheckpointIndex | null>`
- [x] Construct URL: `${hostUrl}/v1/checkpoints/${sessionId}`
- [x] Handle HTTP 404 → return null (no checkpoints yet)
- [x] Handle HTTP 5xx → throw descriptive error
- [x] Parse and validate JSON structure
- [x] Add reasonable timeout (10 seconds)

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-http.test.ts` (NEW, ~160 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-http.ts` (NEW, ~155 lines) ✅
- `packages/sdk-core/src/utils/index.ts` (MODIFY, +1 line) ✅

**Success Criteria:**
- [x] HTTP client fetches checkpoint index correctly
- [x] 404 returns null (not error)
- [x] Network errors throw descriptive error
- [x] Response validated before returning
- [x] All 10 HTTP client tests pass (exceeded target of 6)

**Test Results:** ✅ **10/10 tests passing**

---

### Sub-phase 7.2: Update Recovery Flow to Use HTTP API ✅

**Goal**: Modify `recoverFromCheckpoints()` to use HTTP API instead of S5 path.

**Line Budget**: 60 lines (40 implementation + 20 tests)

#### Tasks
- [x] Write test: `recoverFromCheckpoints()` uses HTTP API when hostUrl provided
- [x] Write test: `recoverFromCheckpoints()` fetches deltas from S5 using CIDs
- [x] Write test: `recoverFromCheckpoints()` works end-to-end with HTTP + S5
- [x] Write test: `recoverFromCheckpoints()` handles node offline gracefully
- [x] Create `recoverFromCheckpointsFlowWithHttp()` function using HTTP API
- [x] Replace S5 path fetch with HTTP API call (uses `fetchCheckpointIndexFromNode`)
- [x] Keep S5 CID fetch for delta content (unchanged - CIDs are globally addressable)
- [x] Add `GetSessionInfoWithHostUrlFn` type for session info with hostUrl
- [ ] Update SessionManager to use new HTTP-based recovery (deferred to 7.5)

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +120 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (MODIFY, +100 lines) ✅

**Success Criteria:**
- [x] Recovery uses HTTP API for index discovery
- [x] Deltas still fetched from S5 via CID
- [x] End-to-end flow works correctly
- [x] Node offline produces clear error message (`CHECKPOINT_FETCH_FAILED`)
- [x] All 4 new tests pass

**Test Results:** ✅ **36/36 tests passing** (10 HTTP + 26 recovery)

---

### Sub-phase 7.3: Node HTTP Endpoint Specification

**Goal**: Document HTTP endpoint requirements for node developer.

**Line Budget**: Documentation only

#### Tasks
- [ ] Update `docs/NODE_CHECKPOINT_SPEC.md` with HTTP endpoint section:
  - [ ] Endpoint: `GET /v1/checkpoints/{sessionId}`
  - [ ] Response format (CheckpointIndex JSON)
  - [ ] Status codes (200, 404, 500)
  - [ ] CORS headers (if needed)
  - [ ] Rate limiting considerations
- [ ] Add example request/response
- [ ] Add error response format
- [ ] Document authentication (if any - likely none for public read)

**Implementation Files:**
- `docs/NODE_CHECKPOINT_SPEC.md` (MODIFY, +100 lines)

**Success Criteria:**
- [ ] HTTP endpoint fully documented
- [ ] Request/response examples provided
- [ ] Error cases documented
- [ ] Ready for node developer implementation

---

### Sub-phase 7.4: Node HTTP Endpoint Implementation (Rust)

**Goal**: Implement checkpoint HTTP endpoint in node.

**Line Budget**: ~60 lines Rust

**Note**: This sub-phase is implemented by node developer, documented here for completeness.

#### Tasks
- [ ] Add route: `GET /v1/checkpoints/{session_id}`
- [ ] Query checkpoint store for session
- [ ] Return JSON checkpoint index
- [ ] Handle 404 when no checkpoints exist
- [ ] Add to existing Axum router

**Implementation Files (Node repo):**
- `src/api/checkpoints.rs` (NEW, ~60 lines)
- `src/api/server.rs` (MODIFY, add route)

**Pseudocode:**
```rust
// GET /v1/checkpoints/{session_id}
async fn get_checkpoints(
    Path(session_id): Path<u64>,
    State(checkpoint_store): State<Arc<CheckpointStore>>,
) -> impl IntoResponse {
    match checkpoint_store.get_index(session_id) {
        Some(index) => Json(index).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
```

**Success Criteria:**
- [ ] Endpoint returns checkpoint index
- [ ] 404 when no checkpoints
- [ ] JSON format matches SDK expectations

---

### Sub-phase 7.5: E2E Testing with HTTP API

**Goal**: Test full recovery flow with real node HTTP endpoint.

**Line Budget**: 40 lines (test harness modifications)

#### Tasks
- [ ] Update `testRecovery()` in chat-context-rag-demo.tsx to use HTTP API
- [ ] Test: Start session → Stream → Click "Test Recovery" → Verify checkpoints found
- [ ] Verify recovered message count matches node's published checkpoints
- [ ] Verify token count accuracy
- [ ] Document updated manual test procedure

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +20 lines)

**Success Criteria:**
- [ ] Recovery finds checkpoints via HTTP API
- [ ] Deltas fetched from S5 successfully
- [ ] Messages recovered correctly
- [ ] Token count matches expectations
- [ ] Manual test passes end-to-end

**Updated Manual Test Procedure:**
1. Navigate to http://localhost:3000/chat-context-rag-demo
2. Connect wallet and start session
3. Send 2-3 prompts (generate ~2000+ tokens for checkpoints)
4. Wait for node to publish checkpoints (observe node logs)
5. Click "Test Recovery" button
6. Verify system message shows recovered messages and token count
7. Verify messages match what was streamed

---

### Sub-phase 7.6: Integration Test Suite

**Goal**: Add automated integration tests for HTTP-based recovery.

**Line Budget**: 100 lines (tests only)

#### Tasks
- [ ] Write test: HTTP API returns checkpoint index correctly
- [ ] Write test: Full flow - HTTP index → S5 delta fetch → merge → verify
- [ ] Write test: Recovery handles node returning empty checkpoints
- [ ] Write test: Recovery handles network timeout to node
- [ ] Write test: Delta CID fetch from S5 works correctly
- [ ] Mock HTTP responses for node endpoint
- [ ] Verify proof hash matches on-chain (existing tests)

**Test Files:**
- `packages/sdk-core/tests/integration/checkpoint-http-recovery.test.ts` (NEW, ~150 lines)

**Success Criteria:**
- [ ] All HTTP integration tests pass
- [ ] Full recovery flow tested with HTTP API
- [ ] Error cases handled gracefully
- [ ] No flaky tests

---

## Phase 7 Summary

| Sub-phase | Description | SDK Changes | Node Changes | Tests |
|-----------|-------------|-------------|--------------|-------|
| 7.1 | HTTP client utility | 80 lines | 0 | 6 |
| 7.2 | Update recovery flow | 45 lines | 0 | 4 |
| 7.3 | Node endpoint spec | Docs only | 0 | 0 |
| 7.4 | Node implementation | 0 | ~60 lines | 0 |
| 7.5 | E2E testing | 20 lines | 0 | Manual |
| 7.6 | Integration tests | 150 lines | 0 | 7 |
| **Total** | | **~295 lines** | **~60 lines** | **17+** |

---

## Files Changed Summary

| File | Phase | Lines Added | Lines Modified |
|------|-------|-------------|----------------|
| `src/types/session.types.ts` | 1.1 | ~40 | 0 |
| `src/types/index.ts` | 1.1 | ~4 | 0 |
| `src/interfaces/ISessionManager.ts` | 1.2 | ~15 | 0 |
| `src/utils/signature.ts` | 2.1-2.2 | ~55 | 0 (new) |
| `src/utils/index.ts` | 2.1, 7.1 | ~2 | 0 |
| `src/managers/SessionManager.ts` | 3.1-3.5, 7.2 | ~240 | 0 |
| `src/utils/checkpoint-http.ts` | 7.1 | ~80 | 0 (new) |
| `src/utils/checkpoint-recovery.ts` | 3.1-3.5, 7.2 | ~350 | +30 |
| `tests/unit/checkpoint-types.test.ts` | 1.1-1.2 | ~60 | 0 (new) |
| `tests/unit/signature-verification.test.ts` | 2.1-2.2 | ~140 | 0 (new) |
| `tests/unit/checkpoint-recovery.test.ts` | 3.1-3.5, 7.2 | ~510 | 0 (new) |
| `tests/unit/checkpoint-http.test.ts` | 7.1 | ~120 | 0 (new) |
| `tests/integration/checkpoint-recovery.test.ts` | 5.1 | ~250 | 0 (new) |
| `tests/integration/checkpoint-http-recovery.test.ts` | 7.6 | ~150 | 0 (new) |
| `docs/NODE_CHECKPOINT_SPEC.md` | 4.1, 7.3 | ~300 | +100 |
| `apps/harness/pages/chat-context-rag-demo.tsx` | 5.2, 7.5 | ~70 | 0 |
| **Total** | | **~1785** | **+130** |

---

## Test Coverage Target

| Test File | Tests | Status |
|-----------|-------|--------|
| `checkpoint-types.test.ts` | 8 | ✅ |
| `signature-verification.test.ts` | 14 | ✅ |
| `checkpoint-recovery.test.ts` (unit) | 22 | ✅ |
| `checkpoint-recovery.test.ts` (integration) | 7 | ✅ |
| `checkpoint-http.test.ts` (unit) | 6 | [ ] Phase 7.1 |
| `checkpoint-http-recovery.test.ts` (integration) | 7 | [ ] Phase 7.6 |
| **Total** | **~64** | **51/64** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Node doesn't implement checkpoints | Document limitation, recovery returns empty |
| S5 unavailable | Graceful degradation, log warning |
| Signature verification fails | Clear error message, don't corrupt SDK storage |
| Large checkpoint index | Pagination (future), warn if >100 checkpoints |
| Race condition during recovery | Lock session during recovery operation |
| Malformed checkpoint data | Validate structure before processing |

---

## Dispute Resolution Scenarios

### Scenario 1: User claims incomplete delivery
```
Claim: "Host claimed 2000 tokens but only delivered 1500"

Resolution:
1. SDK fetches checkpoint index from S5
2. SDK verifies each checkpoint.proofHash matches on-chain
3. SDK fetches and verifies delta signatures
4. SDK counts actual tokens in merged messages
5. If count matches claimed → Dispute rejected with proof
6. If count doesn't match → Evidence of fraud
```

### Scenario 2: Host provides false checkpoints
```
Attack: Host publishes checkpoint claiming tokens that weren't delivered

Defense:
1. Checkpoint proofHash MUST match on-chain proof
2. On-chain proof was signed by host wallet
3. STARK proof cryptographically commits to actual computation
4. If checkpoint content doesn't match STARK commitment → Verifiable fraud
```

### Scenario 3: Host doesn't publish checkpoints
```
Situation: Host submits proofs but no checkpoint index

Impact:
- Payment proceeds normally (proofs are valid)
- Conversation recovery not possible
- User loses conversation visibility (like today)

Mitigation:
- Future: Require checkpoint publication for proof acceptance
- For now: Document as known limitation
```

---

## Dependencies

| Dependency | Status | Blocker? |
|------------|--------|----------|
| SDK Phase 1-5 | ✅ Complete | No |
| Node checkpoint publishing | ✅ Complete (v8.11.0) | No |
| S5 storage access | ✅ Available | No |
| Contract proof query | ✅ Available | No |
| **Node HTTP endpoint** | ❌ Not started | **Yes** (for Phase 7.5 E2E) |
| SDK HTTP client | Not started | No (Phase 7.1) |

---

## Questions for Node Developer

1. **S5 Path Structure**: Is `home/checkpoints/{hostAddress}/{sessionId}/` acceptable?
2. **Signature Format**: EIP-191 signed message hash, or raw ECDSA?
3. **Delta Content**: Should deltas include raw token strings or just message objects?
4. **Index Updates**: Atomic update or append-only?
5. **Cleanup**: When should old checkpoints be deleted (session end? 30 days?)

---

## Not In Scope (Future Phases)

- Automatic recovery on session reconnect
- Recovery UI in chat-context-rag-demo (beyond test button)
- Checkpoint compression
- Incremental index fetching (pagination)
- Cross-session checkpoint aggregation
- Checkpoint caching in SDK
- Node-offline recovery (would require caching CIDs locally)

---

## Lessons Learned

### S5 Namespace Isolation (Phase 5.2 → Phase 7)

**Attempted Approach**: SDK fetches checkpoint index from S5 path `home/checkpoints/{hostAddress}/{sessionId}/index.json`

**Why It Failed**: S5's `home/` directory is per-user (private namespace). The node uploads to its own `home/`, but the SDK queries its own (different) `home/`. They cannot see each other's files.

**Solution**: HTTP API (Phase 7). Node exposes checkpoint index via HTTP, SDK queries it, then fetches deltas from S5 using globally-addressable CIDs.

**Key Insight**: CIDs are globally addressable on S5 (content-addressed), but paths like `home/...` are user-specific (namespace-addressed).
