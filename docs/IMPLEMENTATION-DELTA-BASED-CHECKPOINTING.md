# Implementation Plan: Delta-Based Conversation Checkpointing

## Overview

Enable SDK recovery of conversation state from node-published checkpoints when sessions timeout or disconnect mid-stream. Uses delta-based storage to minimize S5 storage requirements while providing verifiable conversation recovery.

## Status: Phase 8 Complete ✅ | Phase 9 In Progress (Sub-phases 9.1-9.5 Complete)

**Priority**: Critical for MVP
**SDK Version**: 1.8.8 (encrypted checkpoint recovery complete)
**Node Requirement**: Checkpoint publishing ✅ + HTTP endpoint ✅ + Encryption ✅ + deltaCID on-chain ✅ (v8.12.4)
**Test Results**: 144/144 tests passing (+24 blockchain recovery tests)
**E2E Verified**: Encrypted checkpoint recovery verified with node v8.12.0
**Phase 8**: Complete - All 5 sub-phases implemented and tested
**Phase 9**: In Progress - Sub-phases 9.1-9.5 complete; 9.6 (SessionManager integration) + 9.7 (E2E/docs) pending

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

## Phase 6: Build and Release ✅

### Sub-phase 6.1: Build Verification ✅

**Goal**: Ensure SDK builds and all tests pass.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [x] Run `cd packages/sdk-core && pnpm build`
- [x] Verify build succeeds without errors
- [x] Run `cd packages/sdk-core && pnpm test`
- [x] Verify all checkpoint-related tests pass (47/47)
- [x] Check bundle size increase is reasonable

**Success Criteria:**
- [x] Build completes successfully
- [x] All tests pass
- [x] Bundle size: 441KB tarball

---

### Sub-phase 6.2: Create SDK Tarball ✅

**Goal**: Package SDK with checkpoint recovery support.

**Line Budget**: 0 lines (packaging only)

#### Tasks
- [x] Update package.json version to 1.8.6
- [x] Run `cd packages/sdk-core && pnpm build`
- [x] Run `cd packages/sdk-core && pnpm pack`
- [x] Verify tarball created: `fabstir-sdk-core-1.8.6.tgz`
- [ ] Update CHANGELOG.md with checkpoint recovery feature (deferred)

**Success Criteria:**
- [x] SDK version 1.8.6
- [x] Tarball includes checkpoint recovery code
- [ ] CHANGELOG updated (deferred)

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

### Sub-phase 7.3: Node HTTP Endpoint Specification ✅

**Goal**: Document HTTP endpoint requirements for node developer.

**Line Budget**: Documentation only

#### Tasks
- [x] Update `docs/NODE_CHECKPOINT_SPEC.md` with HTTP endpoint section:
  - [x] Endpoint: `GET /v1/checkpoints/{sessionId}`
  - [x] Response format (CheckpointIndex JSON)
  - [x] Status codes (200, 404, 500)
  - [x] CORS headers (if needed)
  - [x] Rate limiting considerations (none for MVP)
- [x] Add example request/response
- [x] Add error response format
- [x] Document authentication (if any - none, public read)
- [x] Add implementation notes from node developer (CID format, JSON key ordering, signature verification)

**Implementation Files:**
- `docs/NODE_CHECKPOINT_SPEC.md` (MODIFIED, +260 lines)

**Success Criteria:**
- [x] HTTP endpoint fully documented
- [x] Request/response examples provided
- [x] Error cases documented
- [x] Ready for node developer implementation

---

### Sub-phase 7.4: Node HTTP Endpoint Implementation (Rust) ✅

**Goal**: Implement checkpoint HTTP endpoint in node.

**Line Budget**: ~60 lines Rust

**Note**: This sub-phase was implemented by node developer.

#### Tasks
- [x] Add route: `GET /v1/checkpoints/{session_id}`
- [x] Query checkpoint store for session
- [x] Return JSON checkpoint index
- [x] Handle 404 when no checkpoints exist
- [x] Add to existing Axum router

**Implementation Files (Node repo):**
- `src/api/checkpoints.rs` (NEW, ~60 lines)
- `src/api/server.rs` (MODIFY, add route)

**Success Criteria:**
- [x] Endpoint returns checkpoint index
- [x] 404 when no checkpoints
- [x] JSON format matches SDK expectations

**Node Version**: v8.11.2

---

### Sub-phase 7.5: E2E Testing with HTTP API ✅

**Goal**: Test full recovery flow with real node HTTP endpoint.

**Line Budget**: 40 lines (test harness modifications)

#### Tasks
- [x] Update `testRecovery()` in chat-context-rag-demo.tsx to use HTTP API
- [x] Test: Start session → Stream → Click "Test Recovery" → Verify checkpoints found
- [x] Verify recovered message count matches node's published checkpoints
- [x] Verify token count accuracy
- [x] Document updated manual test procedure

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +60 lines)

**Success Criteria:**
- [x] Recovery finds checkpoints via HTTP API
- [x] Deltas fetched from S5 successfully
- [x] Messages recovered correctly (4 messages from 2 checkpoints)
- [x] Token count matches expectations (1563 tokens)
- [x] Manual test passes end-to-end

**E2E Results:**
```
System: 🔄 Testing recovery for session 40...
System: ✅ Recovered 4 messages from 2 checkpoints
System: 📊 Total tokens recovered: 1563
```

---

### Sub-phase 7.6: Integration Test Suite ✅

**Goal**: Add automated integration tests for HTTP-based recovery.

**Line Budget**: 100 lines (tests only)

#### Tasks
- [x] Write test: HTTP API returns checkpoint index correctly
- [x] Write test: Full flow - HTTP index → S5 delta fetch → merge → verify
- [x] Write test: Recovery handles node returning empty checkpoints
- [x] Write test: Recovery handles network timeout to node
- [x] Write test: Delta CID fetch from S5 works correctly
- [x] Mock HTTP responses for node endpoint
- [x] Verify proof hash matches on-chain (existing tests)

**Test Files:**
- `packages/sdk-core/tests/integration/checkpoint-http-e2e.test.ts` (NEW)
- `packages/sdk-core/tests/integration/checkpoint-recovery-integration.test.ts` (NEW)

**Success Criteria:**
- [x] All HTTP integration tests pass
- [x] Full recovery flow tested with HTTP API
- [x] Error cases handled gracefully
- [x] No flaky tests

**Test Results:** ✅ **47/47 tests passing**

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

## Phase 8: Encrypted Checkpoint Deltas

### Background: E2E Encryption Gap

**Problem Discovered:**

Sessions use E2E encryption (Phase 6.2), but checkpoint deltas are saved as **plaintext** to S5. This leaks conversation content.

```
Current Flow (Privacy Leak):
──────────────────────────────
1. User sends encrypted prompt → Host decrypts → LLM processes
2. Host generates response → Encrypts → Sends to user
3. Host saves checkpoint delta with PLAINTEXT messages to S5 ⚠️
4. Anyone with CID can read conversation content
```

**Solution: Encrypted Checkpoint Deltas**

Host encrypts checkpoint deltas with user's stable public key before saving to S5. Only the user can decrypt during recovery.

```
Fixed Flow (Private):
─────────────────────
1. User provides stable public key in session init
2. Host encrypts checkpoint delta with user's public key
3. Host uploads encrypted delta to S5
4. Only user can decrypt during recovery
```

### Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENCRYPTED CHECKPOINT DELTA FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SESSION INIT                                                                │
│  ════════════                                                                │
│  User → Host: encrypted_session_init includes:                               │
│    - ephemeral public key (for real-time E2E)                                │
│    - recovery public key (stable, for checkpoint encryption) ← NEW           │
│                                                                              │
│  CHECKPOINT SAVE (Node)                                                      │
│  ═══════════════════════                                                     │
│  1. Create delta: { messages, proofHash, tokenRange, ... }                   │
│  2. Generate ephemeral keypair (forward secrecy)                             │
│  3. ECDH: ephemeral_private × user_recovery_public = shared_secret           │
│  4. Derive key: HKDF(shared_secret) → encryption_key                         │
│  5. Encrypt: XChaCha20-Poly1305(delta_json, encryption_key, nonce)           │
│  6. Upload to S5: { encrypted: true, ephemeralPub, nonce, ciphertext, ... }  │
│                                                                              │
│  CHECKPOINT RECOVERY (SDK)                                                   │
│  ═════════════════════════                                                   │
│  1. Fetch encrypted delta from S5                                            │
│  2. ECDH: user_recovery_private × ephemeral_public = shared_secret           │
│  3. Derive key: HKDF(shared_secret) → encryption_key                         │
│  4. Decrypt: XChaCha20-Poly1305.decrypt(ciphertext, key, nonce)              │
│  5. Parse and verify delta content                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Encrypted Delta Format

```typescript
// Encrypted checkpoint delta (new format)
interface EncryptedCheckpointDelta {
  encrypted: true;
  version: 1;

  // Recipient identification
  userRecoveryPubKey: string;     // User's stable public key (hex)

  // ECDH encryption metadata
  ephemeralPublicKey: string;     // Host's ephemeral key for this delta (hex)
  nonce: string;                  // 24 bytes for XChaCha20 (hex)
  ciphertext: string;             // Encrypted CheckpointDelta JSON (hex)

  // Verification
  hostSignature: string;          // EIP-191 signature over encrypted content
}

// Plaintext checkpoint delta (existing format, for backward compat)
interface CheckpointDelta {
  encrypted?: false;              // Undefined or false = plaintext
  sessionId: string;
  checkpointIndex: number;
  proofHash: string;
  startToken: number;
  endToken: number;
  messages: Message[];
  hostSignature: string;
}
```

### Cryptographic Primitives

| Component | Algorithm | Library |
|-----------|-----------|---------|
| Key Exchange | ECDH on secp256k1 | @noble/secp256k1 |
| Symmetric Encryption | XChaCha20-Poly1305 | @noble/ciphers |
| Key Derivation | HKDF-SHA256 | @noble/hashes |
| Nonce | 24 random bytes | crypto.getRandomValues |

Same primitives as Phase 6.2 E2E encryption for consistency.

---

### Sub-phase 8.1: SDK - User Recovery Public Key ✅

**Goal**: Derive and expose user's stable public key for checkpoint encryption.

**Line Budget**: 60 lines (40 implementation + 20 tests)

#### Tasks
- [x] Write test: `getRecoveryPublicKey()` returns stable public key
- [x] Write test: Public key is consistent across calls (deterministic)
- [x] Write test: Public key is different from ephemeral session keys
- [x] Write test: Public key can be derived from wallet private key
- [x] Add `getRecoveryPublicKey(): string` to EncryptionManager
- [x] Derive from wallet private key using deterministic path
- [x] Export as compressed hex public key
- [x] Add to session init payload (optional field for backward compat)

**Test Files:**
- `packages/sdk-core/tests/unit/encryption-recovery-key.test.ts` (NEW, ~133 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/EncryptionManager.ts` (MODIFY, +15 lines) ✅
- `packages/sdk-core/src/interfaces/IEncryptionManager.ts` (MODIFY, +17 lines) ✅
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +2 lines) ✅

**Success Criteria:**
- [x] Recovery public key derivable from wallet
- [x] Key is stable (same wallet = same key)
- [x] Key included in session init (when encryption enabled)
- [x] All 10 tests pass

**Test Results:** ✅ **10/10 tests passing**

---

### Sub-phase 8.2: Node - Encrypted Delta Specification ✅

**Goal**: Document encryption requirements for node developer.

**Line Budget**: Documentation only

#### Tasks
- [x] Update `docs/NODE_CHECKPOINT_SPEC.md` with encryption section:
  - [x] Encrypted delta format (EncryptedCheckpointDelta schema)
  - [x] ECDH key exchange process
  - [x] XChaCha20-Poly1305 encryption steps
  - [x] HKDF key derivation parameters
  - [x] Signature format (sign over encrypted content)
- [x] Add Python implementation example
- [x] Add test vectors for verification
- [x] Document backward compatibility (plaintext still accepted)

**Implementation Files:**
- `docs/NODE_CHECKPOINT_SPEC.md` (MODIFY, +720 lines) ✅

**Success Criteria:**
- [x] Encryption process fully documented
- [x] Code examples provided (complete Python implementation ~330 lines)
- [x] Test vectors included (3 test vectors)
- [x] Ready for node developer

---

### Sub-phase 8.3: SDK - Decrypt Checkpoint Deltas ✅

**Goal**: Add decryption capability to checkpoint recovery flow.

**Line Budget**: 100 lines (60 implementation + 40 tests)

#### Tasks
- [x] Write test: `decryptCheckpointDelta()` decrypts valid encrypted delta
- [x] Write test: Decryption fails with wrong private key
- [x] Write test: Decryption fails with tampered ciphertext
- [x] Write test: Decryption fails with wrong nonce
- [x] Write test: `fetchAndVerifyDelta()` handles encrypted delta
- [x] Write test: `fetchAndVerifyDelta()` handles plaintext delta (backward compat)
- [x] Write test: Recovery flow works with encrypted deltas
- [x] Create `decryptCheckpointDelta(encryptedDelta, userPrivateKey): CheckpointDelta`
- [x] Implement ECDH shared secret derivation
- [x] Implement HKDF key derivation
- [x] Implement XChaCha20-Poly1305 decryption
- [x] Update `fetchAndVerifyDelta()` to detect and handle encryption
- [x] Add `userPrivateKey` parameter to recovery flow

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-encryption.test.ts` (NEW, ~280 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-recovery.ts` (MODIFY, +50 lines) ✅
- `packages/sdk-core/src/utils/checkpoint-encryption.ts` (NEW, ~200 lines) ✅

**Success Criteria:**
- [x] Valid encrypted deltas decrypted correctly
- [x] Invalid/tampered deltas rejected
- [x] Plaintext deltas still work (backward compat)
- [x] All 17 tests pass (exceeds original 7 test target)

**Test Results:** ✅ **17/17 encryption tests + 53/53 total checkpoint tests passing**

---

### Sub-phase 8.4: Node - Implement Delta Encryption ✅

**Goal**: Node encrypts checkpoint deltas before S5 upload.

**Line Budget**: ~80 lines Python/Rust

**Note**: This sub-phase is implemented by node developer. **Completed in Node v8.12.0**.

#### Tasks
- [x] Extract user recovery public key from session init
- [x] Generate ephemeral keypair per checkpoint (forward secrecy)
- [x] Implement ECDH shared secret computation
- [x] Implement HKDF key derivation (info=b"checkpoint-delta-encryption-v1")
- [x] Implement XChaCha20-Poly1305 encryption
- [x] Format encrypted delta with metadata
- [x] Sign over keccak256(ciphertext) with host key (EIP-191)
- [x] Upload encrypted delta to S5

**Implementation Files (Node repo):**
- `src/checkpoint/encryption.py` or `src/checkpoint/encryption.rs` (NEW, ~80 lines)
- `src/checkpoint/store.py` or `src/checkpoint/store.rs` (MODIFY)

**Pseudocode (Python):**
```python
def encrypt_checkpoint_delta(delta: dict, user_recovery_pub: bytes) -> dict:
    # Generate ephemeral keypair
    eph_priv = os.urandom(32)
    eph_pub = secp256k1.pubkey_from_privkey(eph_priv)

    # ECDH shared secret
    shared_point = secp256k1.multiply(user_recovery_pub, eph_priv)
    shared_secret = sha256(shared_point.x.to_bytes(32, 'big'))

    # HKDF key derivation
    key = hkdf_sha256(shared_secret, salt=None, info=b"checkpoint-encryption", length=32)

    # Encrypt with XChaCha20-Poly1305
    nonce = os.urandom(24)
    plaintext = json.dumps(delta).encode()
    ciphertext = xchacha20_poly1305_encrypt(key, nonce, plaintext)

    return {
        "encrypted": True,
        "version": 1,
        "userRecoveryPubKey": user_recovery_pub.hex(),
        "ephemeralPublicKey": eph_pub.hex(),
        "nonce": nonce.hex(),
        "ciphertext": ciphertext.hex(),
        "hostSignature": sign_encrypted_content(...)
    }
```

**Success Criteria:**
- [x] Deltas encrypted with user's public key
- [x] Ephemeral key used per checkpoint (forward secrecy)
- [x] Encrypted format matches SDK expectations
- [x] SDK can decrypt node-encrypted deltas

**Completed**: Node v8.12.0 - Encrypted checkpoint deltas ready for integration.

---

### Sub-phase 8.5: Integration Testing ✅

**Goal**: Test full encrypted checkpoint recovery flow.

**Line Budget**: 80 lines (tests only)

#### Tasks
- [x] Write test: Full flow with encrypted checkpoints (node → S5 → SDK recovery)
- [x] Write test: Recovery works when mixing encrypted and plaintext deltas
- [x] Write test: Recovery fails gracefully if decryption key unavailable
- [x] Write test: Encrypted recovery in harness UI (via SessionManager.recoverFromCheckpoints)
- [x] Add encrypted checkpoint test scenario to E2E harness
- [x] Document manual test procedure

**Test Files:**
- `packages/sdk-core/tests/integration/checkpoint-encryption-e2e.test.ts` (NEW, ~450 lines) ✅
- `packages/sdk-core/tests/unit/encryption-recovery-key.test.ts` (MODIFY, +30 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/managers/EncryptionManager.ts` (MODIFY, +15 lines) ✅
- `packages/sdk-core/src/interfaces/IEncryptionManager.ts` (MODIFY, +10 lines) ✅
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +12 lines) ✅

**Success Criteria:**
- [x] Encrypted checkpoints recovered correctly (10/10 E2E tests)
- [x] Mixed encrypted/plaintext handled (backward compat verified)
- [x] Clear error when decryption fails (DECRYPTION_FAILED, DECRYPTION_KEY_REQUIRED)
- [x] SessionManager automatically uses EncryptionManager for decryption

**Test Results:** ✅ **10/10 E2E tests + 13/13 recovery key tests passing**

**Manual Test Procedure:**
1. Navigate to http://localhost:3000/chat-context-rag-demo
2. Connect wallet and start session (encryption enabled by default)
3. Send 2-3 prompts to generate checkpoints
4. Verify node logs show "Encrypted checkpoint saved"
5. Click "Test Recovery" button
6. Verify system message shows recovered messages
7. Verify messages match what was streamed (decryption worked)

---

### Phase 8 Summary ✅

| Sub-phase | Description | SDK Changes | Node Changes | Tests | Status |
|-----------|-------------|-------------|--------------|-------|--------|
| 8.1 | User recovery public key | 50 lines | 0 | 10 | ✅ |
| 8.2 | Node encryption spec | 720 lines docs | 0 | 0 | ✅ |
| 8.3 | SDK decryption | 280 lines | 0 | 17 | ✅ |
| 8.4 | Node encryption impl | 0 | ~80 lines | 0 | ✅ |
| 8.5 | Integration testing | 45 lines | 0 | 23 | ✅ |
| **Total** | | **~375 lines** | **~80 lines** | **50** | ✅ |

---

### Security Properties

| Property | How Achieved |
|----------|--------------|
| **Confidentiality** | XChaCha20-Poly1305 encryption with user's public key |
| **Authenticity** | Poly1305 MAC + host signature |
| **Forward Secrecy** | Ephemeral keypair per checkpoint |
| **Integrity** | AEAD encryption + signature verification |
| **User-Only Access** | Only user has private key to decrypt |

---

### Backward Compatibility

The SDK will support both encrypted and plaintext deltas:

```typescript
async function fetchAndVerifyDelta(
  storageManager: IStorageManager,
  deltaCID: string,
  hostAddress: string,
  userPrivateKey?: string  // Optional - only needed for encrypted deltas
): Promise<CheckpointDelta> {
  const raw = await storageManager.retrieve(deltaCID);

  if (raw.encrypted === true) {
    if (!userPrivateKey) {
      throw new SDKError('User private key required for encrypted checkpoint', 'DECRYPTION_KEY_REQUIRED');
    }
    return decryptCheckpointDelta(raw, userPrivateKey);
  }

  // Plaintext delta (backward compat)
  return raw as CheckpointDelta;
}
```

---

### Migration Path

1. **Phase 8.1-8.3**: SDK supports decryption (backward compat with plaintext)
2. **Phase 8.4**: Node starts encrypting new checkpoints
3. **Gradual**: Old plaintext checkpoints remain readable
4. **Future**: Consider requiring encryption (breaking change)

---

## Lessons Learned

### S5 Namespace Isolation (Phase 5.2 → Phase 7)

**Attempted Approach**: SDK fetches checkpoint index from S5 path `home/checkpoints/{hostAddress}/{sessionId}/index.json`

**Why It Failed**: S5's `home/` directory is per-user (private namespace). The node uploads to its own `home/`, but the SDK queries its own (different) `home/`. They cannot see each other's files.

**Solution**: HTTP API (Phase 7). Node exposes checkpoint index via HTTP, SDK queries it, then fetches deltas from S5 using globally-addressable CIDs.

**Key Insight**: CIDs are globally addressable on S5 (content-addressed), but paths like `home/...` are user-specific (namespace-addressed).

---

## Phase 9: Decentralized Recovery via On-Chain deltaCID

**Status**: IN PROGRESS (Sub-phases 9.1-9.5 ✅ Complete, 9.6-9.7 Pending)
**Priority**: Critical - Removes centralized dependency
**Requires**: Contract upgrade ✅ + Node update ✅ (v8.12.4) + SDK integration ⏳

### Problem: Centralized HTTP API Dependency

Phase 7's HTTP API solution has a **fundamental flaw** for a decentralized P2P network:

```
┌─────────────────────────────────────────────────────────────────┐
│  CURRENT FLOW (FLAWED)                                          │
│                                                                 │
│  User wants to recover conversation after session ends          │
│                                                                 │
│  1. SDK calls HTTP API: GET /v1/checkpoints/{sessionId}         │
│                         ↑                                       │
│                    PROBLEM: Host may be offline!                │
│                                                                 │
│  In a decentralized P2P network, hosts can:                     │
│  - Go offline after session ends                                │
│  - Change IP/NAT configuration                                  │
│  - Refuse connections                                           │
│  - User may have lost host URL                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Solution: Store deltaCID in ProofSubmitted Event

Add `deltaCID` to the blockchain event, providing:
- **Non-repudiation**: Host's transaction signature covers deltaCID
- **Availability**: CID always discoverable from blockchain
- **Decentralization**: No HTTP API dependency for recovery

### Security Comparison: HTTP vs On-Chain

| Property | HTTP API (Phase 7) | Blockchain (Phase 9) |
|----------|-------------------|---------------------|
| **Non-repudiation** | Weak | Strong (host signed tx) |
| **CID Availability** | Host must be online | Always available |
| **Tampering** | deltaCID not signed | deltaCID in signed tx |
| **Audit trail** | S5 only | Blockchain + S5 |
| **Dispute evidence** | Indirect | Direct on-chain |

### Architecture Change

**Current ProofSubmitted Event:**
```solidity
event ProofSubmitted(
    uint256 indexed jobId,
    address indexed host,
    uint256 tokensClaimed,
    bytes32 proofHash,
    string proofCID
);
```

**New ProofSubmitted Event:**
```solidity
event ProofSubmitted(
    uint256 indexed jobId,
    address indexed host,
    uint256 tokensClaimed,
    bytes32 proofHash,
    string proofCID,
    string deltaCID      // NEW: Checkpoint delta CID for recovery
);
```

### Decentralized Recovery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  NEW DECENTRALIZED RECOVERY FLOW                                │
│                                                                 │
│  1. User queries blockchain:                                    │
│     → ProofSubmitted events for jobId/sessionId                 │
│     → Gets deltaCID from each event                             │
│                                                                 │
│  2. User fetches from S5 (globally accessible):                 │
│     → deltaCID1 → conversation delta (checkpoint 0)             │
│     → deltaCID2 → conversation delta (checkpoint 1)             │
│                                                                 │
│  3. User merges deltas → recovered conversation                 │
│                                                                 │
│  ✓ No HTTP API needed                                           │
│  ✓ Host can be offline                                          │
│  ✓ Fully decentralized                                          │
│  ✓ Non-repudiable (host signed tx with deltaCID)               │
└─────────────────────────────────────────────────────────────────┘
```

---

### Sub-phase 9.1: Contract Update (Contracts Developer) ✅ COMPLETE

**Scope**: Update JobMarketplace contract to emit deltaCID in ProofSubmitted event

**Deployed**: 2026-01-14
- **Proxy Address**: 0x3CaCbf3f448B420918A93a88706B26Ab27a3523E (unchanged)
- **New Implementation**: 0x1B6C6A1E373E5E00Bf6210e32A6DA40304f6484c

| Task | Status | Description |
|------|--------|-------------|
| [x] | Update `submitProofOfWork` signature | Add `string calldata deltaCID` parameter |
| [x] | Update `ProofSubmitted` event | Add `deltaCID` field |
| [x] | Update function to emit deltaCID | Include in event emission |
| [x] | Write contract unit tests | Test event emission with deltaCID |
| [x] | Deploy to Base Sepolia testnet | Get new contract address |
| [x] | Update `.env.test` | Owner updates contract address |
| [x] | Export client ABI | `JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` |

**Additional Breaking Changes**:
- `getProofSubmission()` now returns 5 values: `[proofHash, tokensClaimed, timestamp, verified, deltaCID]`

**Contract Code Change:**
```solidity
// Before
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    bytes calldata signature,
    string calldata proofCID
) external;

// After
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    bytes calldata signature,
    string calldata proofCID,
    string calldata deltaCID  // NEW
) external;
```

**Verification**:
```bash
# After deployment, verify event includes deltaCID
cast logs --address <NEW_CONTRACT> "ProofSubmitted(uint256,address,uint256,bytes32,string,string)"
```

---

### Sub-phase 9.2: Node Update (Node Developer) ✅ COMPLETE

**Scope**: Node includes deltaCID when calling submitProofOfWork

**Deployed**: Node v8.12.4 (2026-01-14)

| Task | Status | Description |
|------|--------|-------------|
| [x] | Upload delta to S5 before proof submission | Get deltaCID from upload |
| [x] | Validate deltaCID format | Must be valid S5 CID (`blob...` or `baaa...`) |
| [x] | Update `submitProofOfWork` call | Add deltaCID parameter |
| [x] | Handle upload failures gracefully | Retry logic, error handling |
| [x] | Update logging | Log deltaCID in checkpoint publisher |
| [x] | Verify deltaCID in emitted event | Check transaction logs |

**Node Developer Confirmation (2026-01-14):**
```
Node v8.12.4 deployed - deltaCID now on-chain

submitProofOfWork(jobId, tokensClaimed, proofHash, signature, proofCID, deltaCID)

- deltaCID = "" for sessions without encryption (no recoveryPublicKey)
- deltaCID = S5 blob CID (e.g., uJh9F8K...) for encrypted sessions

Ready for E2E verification.
```

**Implementation Reference:**
```rust
async fn submit_proof_with_checkpoint(session_id, tokens_claimed, proof_data, delta_messages) {
    // 1. Upload delta to S5 FIRST (get CID before tx)
    let delta = CheckpointDelta {
        session_id,
        checkpoint_index: current_index,
        messages: delta_messages,
        encrypted: true,  // Use recovery public key
    };
    let delta_cid = s5_client.upload_encrypted(delta, recovery_public_key).await?;
    info!("[CHECKPOINT] Uploaded delta: deltaCID={}", delta_cid);

    // 2. Generate proof and upload
    let proof_hash = keccak256(proof_data);
    let proof_cid = s5_client.upload(proof_data).await?;

    // 3. Submit to contract WITH deltaCID
    let tx = contract.submit_proof_of_work(
        session_id,
        tokens_claimed,
        proof_hash,
        signature,
        proof_cid,
        delta_cid  // NEW parameter
    ).await?;

    info!("[CHECKPOINT] Proof submitted: tx={}, deltaCID={}", tx.hash, delta_cid);
}
```

---

### Sub-phase 9.3: SDK Types and Interfaces ✅ COMPLETE

**Scope**: Add types for blockchain-based checkpoint query

| Task | Status | Description |
|------|--------|-------------|
| [x] | Create `BlockchainCheckpointEntry` type | For parsed event data |
| [x] | Create `CheckpointQueryOptions` interface | Query parameters |
| [x] | Update `types/index.ts` | Export new types |
| [x] | Write type tests | 6 type tests passing |

**Implementation Files:**
- `packages/sdk-core/src/types/index.ts` (MODIFIED, +32 lines)

**New Types** (`src/types/checkpoint.types.ts`):
```typescript
/**
 * Checkpoint entry parsed from blockchain ProofSubmitted event
 */
export interface BlockchainCheckpointEntry {
  jobId: bigint;
  host: string;
  tokensClaimed: bigint;
  proofHash: string;
  proofCID: string;
  deltaCID: string;        // NEW: From event
  blockNumber: number;
  transactionHash: string;
}

/**
 * Options for querying checkpoint events
 */
export interface CheckpointQueryOptions {
  fromBlock?: number;
  toBlock?: number | 'latest';
}
```

---

### Sub-phase 9.4: Blockchain Event Query ✅ COMPLETE

**Scope**: Query ProofSubmitted events from blockchain

| Task | Status | Description |
|------|--------|-------------|
| [x] | Create `queryProofSubmittedEvents()` function | Query by jobId |
| [x] | Parse events to extract deltaCID | Handle ABI decoding |
| [x] | Sort events by block number | Chronological order |
| [x] | Handle empty deltaCID (pre-upgrade) | Backward compatibility |
| [x] | Write unit tests | 9 event query tests passing |

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-blockchain.ts` (NEW, ~80 lines)
- `packages/sdk-core/src/utils/index.ts` (MODIFIED, +1 export)
- `packages/sdk-core/tests/unit/checkpoint-blockchain.test.ts` (NEW, ~200 lines)

**Test Results:** ✅ **15/15 tests passing** (6 type tests + 9 event query tests)

**Implementation** (`src/utils/checkpoint-blockchain.ts`):
```typescript
import { ethers } from 'ethers';
import type { BlockchainCheckpointEntry, CheckpointQueryOptions } from '../types/checkpoint.types';

/**
 * Query ProofSubmitted events from blockchain for a session
 *
 * @param contract - JobMarketplace contract instance
 * @param jobId - Session/job ID to query
 * @param options - Query options (block range)
 * @returns Array of checkpoint entries with deltaCIDs
 */
export async function queryProofSubmittedEvents(
  contract: ethers.Contract,
  jobId: bigint,
  options: CheckpointQueryOptions = {}
): Promise<BlockchainCheckpointEntry[]> {
  const { fromBlock = 0, toBlock = 'latest' } = options;

  // Query events filtered by jobId
  const filter = contract.filters.ProofSubmitted(jobId);
  const events = await contract.queryFilter(filter, fromBlock, toBlock);

  // Parse and return
  return events.map(event => ({
    jobId: event.args.jobId,
    host: event.args.host,
    tokensClaimed: event.args.tokensClaimed,
    proofHash: event.args.proofHash,
    proofCID: event.args.proofCID,
    deltaCID: event.args.deltaCID,  // NEW field
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  })).sort((a, b) => a.blockNumber - b.blockNumber);
}
```

**Unit Test** (`tests/unit/checkpoint-blockchain.test.ts`):
```typescript
describe('queryProofSubmittedEvents', () => {
  it('should query events and extract deltaCID', async () => {
    // Mock contract with events
    const mockEvents = [
      { args: { jobId: 1n, deltaCID: 'blobba...', ... }, blockNumber: 100 },
      { args: { jobId: 1n, deltaCID: 'blobbb...', ... }, blockNumber: 200 },
    ];
    mockContract.queryFilter.mockResolvedValue(mockEvents);

    const result = await queryProofSubmittedEvents(mockContract, 1n);

    expect(result).toHaveLength(2);
    expect(result[0].deltaCID).toBe('blobba...');
    expect(result[1].deltaCID).toBe('blobbb...');
  });

  it('should sort events by block number', async () => { ... });
  it('should handle empty result', async () => { ... });
});
```

---

### Sub-phase 9.5: Decentralized Recovery Implementation ✅ COMPLETE

**Scope**: Recovery flow using blockchain events instead of HTTP API

| Task | Status | Description |
|------|--------|-------------|
| [x] | Create `recoverFromBlockchain()` function | Main recovery entry |
| [x] | Query blockchain for ProofSubmitted events | Get deltaCIDs |
| [x] | Fetch deltas from S5 using deltaCIDs | Content-addressed retrieval |
| [x] | Filter out empty deltaCID (pre-upgrade) | Backward compatibility |
| [x] | Decrypt deltas if encrypted | Using recovery private key |
| [x] | Merge deltas into conversation | Chronological merge |
| [x] | Write unit tests | 9 new tests (24/24 total passing)

**Implementation Files:**
- `packages/sdk-core/src/utils/checkpoint-blockchain.ts` (MODIFIED, +95 lines)
- `packages/sdk-core/tests/unit/checkpoint-blockchain.test.ts` (MODIFIED, +180 lines)

**Test Results:** ✅ **24/24 tests passing** (6 type + 9 query + 9 recovery)

**Implementation** (`src/utils/checkpoint-blockchain.ts`):
```typescript
/**
 * Recover conversation from blockchain events (decentralized recovery).
 *
 * This function enables fully decentralized checkpoint recovery:
 * 1. Query ProofSubmitted events from blockchain for the job/session
 * 2. Extract deltaCIDs from events (skipping pre-upgrade proofs with empty deltaCID)
 * 3. Fetch checkpoint deltas from S5 using the deltaCIDs
 * 4. Decrypt deltas if encrypted (using userPrivateKey)
 * 5. Merge deltas chronologically into conversation
 *
 * This approach does NOT require the host to be online.
 */
export async function recoverFromBlockchain(
  contract: ethers.Contract,
  storageManager: BlockchainRecoveryStorageManager,
  jobId: bigint,
  userPrivateKey?: string,
  options: CheckpointQueryOptions = {}
): Promise<BlockchainRecoveredConversation> {
  // Step 1: Query blockchain events
  const allEntries = await queryProofSubmittedEvents(contract, jobId, options);

  // Step 2: Filter to recoverable checkpoints (non-empty deltaCID)
  const recoverableEntries = filterRecoverableCheckpoints(allEntries);

  if (recoverableEntries.length === 0) {
    return { messages: [], tokenCount: 0, checkpoints: [] };
  }

  // Step 3: Fetch deltas from S5
  const deltas: CheckpointDelta[] = [];
  for (const entry of recoverableEntries) {
    const rawDelta = await storageManager.getByCID(entry.deltaCID);

    // Step 4: Decrypt if encrypted
    const delta = isEncryptedDelta(rawDelta)
      ? decryptDeltaIfNeeded(rawDelta, userPrivateKey)
      : rawDelta as CheckpointDelta;

    deltas.push(delta);
  }

  // Step 5: Merge deltas into conversation
  const { messages, tokenCount } = mergeDeltas(deltas);

  return { messages, tokenCount, checkpoints: recoverableEntries };
}
```

---

### Sub-phase 9.6: SessionManager Integration ✅ COMPLETE

**Scope**: Add blockchain-based recovery method to SessionManager

**TDD Approach**: Write tests FIRST, then implement

| Task | Status | Description |
|------|--------|-------------|
| [x] | Write test: `recoverFromBlockchainEvents()` returns empty for no events | Unit test |
| [x] | Write test: `recoverFromBlockchainEvents()` returns messages for valid events | Unit test |
| [x] | Write test: `recoverFromBlockchainEvents()` decrypts encrypted deltas | Unit test |
| [x] | Write test: `recoverFromBlockchainEvents()` throws on S5 fetch failure | Unit test |
| [x] | Add `recoverFromBlockchainEvents()` method to SessionManager | Implementation |
| [x] | Add method signature to `ISessionManager` interface | Type definition |
| [x] | Export types from `checkpoint-blockchain.ts` in utils/index.ts | Export |
| [x] | Add "Test Blockchain Recovery" button to test harness | UI test |
| [ ] | Run E2E test: session → checkpoint → blockchain recovery | E2E verification |

**Test Results**: ✅ 31/31 tests passing (24 blockchain + 7 SessionManager integration)

**SessionManager Update** (`src/managers/SessionManager.ts`):
```typescript
/**
 * Recover conversation from checkpoint deltas (DECENTRALIZED)
 *
 * Queries ProofSubmitted events from blockchain to get deltaCIDs,
 * then fetches deltas from S5. Does NOT require host to be online.
 *
 * @param sessionId - Session ID (jobId) to recover
 * @returns Recovered conversation with messages and token count
 */
async recoverFromCheckpoints(sessionId: bigint): Promise<RecoveredConversation> {
  const contract = this.contractManager.getJobMarketplace();

  // Try blockchain-based recovery first (decentralized)
  const events = await queryProofSubmittedEvents(contract, sessionId);

  // Check if events have deltaCID (post-upgrade sessions)
  if (events.length > 0 && events[0].deltaCID) {
    console.log('[SessionManager] Using decentralized recovery (blockchain events)');
    return await recoverFromBlockchain(
      contract,
      this.storageManager,
      sessionId,
      this.encryptionManager?.getRecoveryPrivateKey()
    );
  }

  // Fallback for pre-upgrade sessions (HTTP API)
  console.warn('[SessionManager] Session predates on-chain deltaCID, trying HTTP fallback');
  const session = this.sessions.get(sessionId.toString());
  if (!session?.endpoint) {
    throw new SDKError(
      'Cannot recover: session predates on-chain deltaCID and no host endpoint available',
      'RECOVERY_UNAVAILABLE'
    );
  }

  // Try HTTP (may fail if host is offline)
  return await recoverFromCheckpointsFlowWithHttp(
    this.storageManager,
    contract,
    async () => ({
      hostAddress: session.provider,
      hostUrl: session.endpoint.replace('ws://', 'http://').replace('/ws', ''),
      status: session.status,
    }),
    sessionId,
    this.encryptionManager?.getRecoveryPrivateKey()
  );
}
```

---

### Sub-phase 9.7: E2E Verification and Documentation

**Scope**: Verify full flow works end-to-end, update documentation

**Prerequisite**: Sub-phase 9.6 complete

| Task | Status | Description |
|------|--------|-------------|
| [ ] | E2E: Create session with recoveryPublicKey | Setup |
| [ ] | E2E: Generate >1000 tokens to trigger checkpoint | Trigger proof |
| [ ] | E2E: Verify ProofSubmitted event contains non-empty deltaCID | Blockchain verify |
| [ ] | E2E: Call `recoverFromBlockchainEvents(jobId)` | Recovery test |
| [ ] | E2E: Verify messages match original conversation | Content verify |
| [ ] | E2E: Test recovery with host offline (optional) | Decentralization test |
| [ ] | Mark HTTP recovery as `@deprecated` in JSDoc | Code annotation |
| [ ] | Update `docs/SDK_API.md` with new method | API docs |
| [ ] | Update this plan file | Mark Phase 9 complete |

**Success Criteria:**
- deltaCID in ProofSubmitted event matches S5 blob CID format
- Recovered messages match original conversation content
- No HTTP API calls needed for recovery
- Decryption works correctly for encrypted deltas

---

### Phase 9 Files to Modify

| File | Change |
|------|--------|
| **Contract** (Contracts Dev) | |
| `JobMarketplaceWithModelsUpgradeable.sol` | Add deltaCID to event and function |
| **Node** (Node Dev) | |
| `src/checkpoint/publisher.rs` | Include deltaCID in proof submission |
| **SDK** | |
| `src/types/checkpoint.types.ts` | Add `BlockchainCheckpointEntry` type |
| `src/utils/checkpoint-blockchain.ts` | NEW: Blockchain event query |
| `src/utils/checkpoint-recovery.ts` | Add `recoverFromBlockchain()` |
| `src/managers/SessionManager.ts` | Update `recoverFromCheckpoints()` |
| `src/contracts/abis/JobMarketplace*.json` | Updated ABI with deltaCID |
| `tests/unit/checkpoint-blockchain.test.ts` | NEW: Unit tests |
| `tests/integration/checkpoint-recovery-blockchain.test.ts` | NEW: E2E tests |

---

### Phase 9 Verification Plan

**Manual Testing**:
1. [ ] Deploy updated contract to testnet
2. [ ] Node submits proof with deltaCID
3. [ ] Verify event includes deltaCID on-chain
4. [ ] SDK queries events, extracts deltaCID
5. [ ] SDK fetches delta from S5
6. [ ] Stop host (simulate offline)
7. [ ] SDK recovers conversation (no HTTP)

**Automated Tests**:
```bash
# Unit tests
pnpm test packages/sdk-core/tests/unit/checkpoint-blockchain.test.ts

# Integration tests (requires deployed contract)
pnpm test packages/sdk-core/tests/integration/checkpoint-recovery-blockchain.test.ts
```

---

### Phase 9 Coordination Requirements

**With Contracts Developer**:
1. Share event specification change
2. Review before deployment
3. Coordinate ABI distribution
4. Test on testnet first

**With Node Developer**:
1. Share deltaCID format requirements (valid S5 CID)
2. Coordinate proof submission changes
3. Verify transaction includes deltaCID
4. Test encryption compatibility

---

### Phase 9 Timeline

| Sub-phase | Owner | Dependencies | Status |
|-----------|-------|--------------|--------|
| 9.1 Contract Update | Contracts Dev | None | ✅ COMPLETE |
| 9.2 Node Update | Node Dev | 9.1 complete | AWAITING |
| 9.3 SDK Types | SDK Dev | 9.1 complete | ✅ COMPLETE |
| 9.4 Event Query | SDK Dev | 9.1 complete | ✅ COMPLETE |
| 9.5 Recovery Impl | SDK Dev | 9.3, 9.4 complete | CAN START |
| 9.6 SessionManager | SDK Dev | 9.5 complete | BLOCKED |
| 9.7 Cleanup/Docs | SDK Dev | 9.6 complete | BLOCKED |

---

### Phase 9 Progress Tracker

**Last Updated**: 2026-01-14

- [x] Sub-phase 9.1: Contract Update - ✅ COMPLETE (deployed 2026-01-14)
- [ ] Sub-phase 9.2: Node Update - AWAITING NODE DEVELOPER
- [x] Sub-phase 9.3: SDK Types - ✅ COMPLETE (15 tests passing)
- [x] Sub-phase 9.4: Event Query - ✅ COMPLETE (15 tests passing)
- [ ] Sub-phase 9.5: Recovery Implementation - CAN START NOW
- [ ] Sub-phase 9.6: SessionManager Integration - BLOCKED (needs 9.5)
- [ ] Sub-phase 9.7: Cleanup and Documentation - BLOCKED (needs 9.6)
