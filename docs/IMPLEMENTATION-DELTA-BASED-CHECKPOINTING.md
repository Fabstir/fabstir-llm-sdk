# Implementation Plan: Delta-Based Conversation Checkpointing

## Overview

Enable SDK recovery of conversation state from node-published checkpoints when sessions timeout or disconnect mid-stream. Uses delta-based storage to minimize S5 storage requirements while providing verifiable conversation recovery.

## Status: Phase 1 Complete ✅

**Priority**: Critical for MVP
**SDK Version Target**: 1.9.0
**Node Requirement**: Checkpoint publishing (new feature required)
**Test Results**: 10/10 tests passing (Phase 1 complete)

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
- [ ] Write test: `verifyHostSignature()` returns true for valid signature
- [ ] Write test: `verifyHostSignature()` returns false for wrong signer
- [ ] Write test: `verifyHostSignature()` returns false for tampered message
- [ ] Write test: `verifyHostSignature()` handles hex string with/without 0x prefix
- [ ] Write test: `verifyHostSignature()` throws on invalid signature format
- [ ] Create `packages/sdk-core/src/utils/signature.ts`
- [ ] Implement `verifyHostSignature(signature: string, message: string, expectedSigner: string): boolean`
- [ ] Use ethers.js `verifyMessage()` for EIP-191 verification
- [ ] Export from `utils/index.ts`

**Test Files:**
- `packages/sdk-core/tests/unit/signature-verification.test.ts` (NEW, ~80 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/signature.ts` (NEW, ~35 lines)
- `packages/sdk-core/src/utils/index.ts` (MODIFY, +1 line)

**Success Criteria:**
- [ ] Valid signatures verified correctly
- [ ] Invalid signatures rejected
- [ ] Edge cases handled (0x prefix, invalid format)
- [ ] All 5 signature tests pass

---

### Sub-phase 2.2: Checkpoint Hash Computation

**Goal**: Add utility to compute deterministic hash of checkpoint data for verification.

**Line Budget**: 40 lines (20 implementation + 20 tests)

#### Tasks
- [ ] Write test: `computeCheckpointHash()` produces consistent hash for same input
- [ ] Write test: `computeCheckpointHash()` produces different hash for different input
- [ ] Write test: `computeCheckpointHash()` handles messages array correctly
- [ ] Write test: `computeCheckpointHash()` matches expected format (keccak256)
- [ ] Add `computeCheckpointHash(messages: Message[], tokenCount: number): string` to signature.ts
- [ ] Use deterministic JSON stringification (sorted keys)
- [ ] Return keccak256 hash as hex string

**Test Files:**
- `packages/sdk-core/tests/unit/signature-verification.test.ts` (EXTEND, +60 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/signature.ts` (MODIFY, +20 lines)

**Success Criteria:**
- [ ] Hash is deterministic (same input = same output)
- [ ] Hash changes when content changes
- [ ] Format is keccak256 hex string
- [ ] All 4 hash tests pass

---

## Phase 3: Recovery Logic Implementation

### Sub-phase 3.1: Fetch Checkpoint Index

**Goal**: Add method to fetch checkpoint index from S5.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [ ] Write test: `fetchCheckpointIndex()` returns null when no index exists
- [ ] Write test: `fetchCheckpointIndex()` returns parsed CheckpointIndex on success
- [ ] Write test: `fetchCheckpointIndex()` constructs correct S5 path
- [ ] Write test: `fetchCheckpointIndex()` throws on malformed JSON
- [ ] Add private `fetchCheckpointIndex(hostAddress: string, sessionId: string): Promise<CheckpointIndex | null>` to SessionManager
- [ ] Construct path: `home/checkpoints/${hostAddress}/${sessionId}/index.json`
- [ ] Handle S5 "not found" gracefully (return null)
- [ ] Parse and validate JSON structure

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (NEW, ~100 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +40 lines)

**Success Criteria:**
- [ ] Correct S5 path constructed
- [ ] Missing index returns null (not error)
- [ ] Valid JSON parsed to CheckpointIndex
- [ ] Invalid JSON throws descriptive error
- [ ] All 4 fetch tests pass

---

### Sub-phase 3.2: Verify Checkpoint Index

**Goal**: Verify index signature and match proof hashes against on-chain.

**Line Budget**: 70 lines (40 implementation + 30 tests)

#### Tasks
- [ ] Write test: `verifyCheckpointIndex()` returns true for valid index
- [ ] Write test: `verifyCheckpointIndex()` throws on invalid signature
- [ ] Write test: `verifyCheckpointIndex()` throws on proofHash mismatch
- [ ] Write test: `verifyCheckpointIndex()` queries on-chain proofs correctly
- [ ] Write test: `verifyCheckpointIndex()` handles empty checkpoints array
- [ ] Add private `verifyCheckpointIndex(index: CheckpointIndex, sessionId: bigint): Promise<void>` to SessionManager
- [ ] Verify host signature on stringified checkpoints array
- [ ] For each checkpoint, query `getProofSubmission(sessionId, index)` from contract
- [ ] Compare on-chain proofHash with checkpoint.proofHash
- [ ] Throw descriptive errors on any mismatch

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +100 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +50 lines)

**Success Criteria:**
- [ ] Valid index passes verification
- [ ] Invalid signature throws `INVALID_INDEX_SIGNATURE`
- [ ] ProofHash mismatch throws `PROOF_HASH_MISMATCH`
- [ ] On-chain queries made correctly
- [ ] All 5 verify tests pass

---

### Sub-phase 3.3: Fetch and Verify Deltas

**Goal**: Fetch each delta from S5 and verify its signature.

**Line Budget**: 60 lines (35 implementation + 25 tests)

#### Tasks
- [ ] Write test: `fetchAndVerifyDelta()` returns delta on valid signature
- [ ] Write test: `fetchAndVerifyDelta()` throws on invalid signature
- [ ] Write test: `fetchAndVerifyDelta()` throws on S5 fetch failure
- [ ] Write test: `fetchAndVerifyDelta()` validates delta structure
- [ ] Add private `fetchAndVerifyDelta(deltaCID: string, hostAddress: string): Promise<CheckpointDelta>` to SessionManager
- [ ] Fetch delta JSON from S5 using deltaCID
- [ ] Verify host signature on stringified messages
- [ ] Validate all required fields present
- [ ] Return parsed CheckpointDelta

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +80 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +40 lines)

**Success Criteria:**
- [ ] Valid delta fetched and returned
- [ ] Invalid signature throws `INVALID_DELTA_SIGNATURE`
- [ ] S5 failure throws `DELTA_FETCH_FAILED`
- [ ] Missing fields throw `INVALID_DELTA_STRUCTURE`
- [ ] All 4 delta tests pass

---

### Sub-phase 3.4: Merge Deltas into Conversation

**Goal**: Merge multiple deltas into a single conversation, handling partial messages.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [ ] Write test: `mergeDeltas()` combines messages from multiple deltas in order
- [ ] Write test: `mergeDeltas()` concatenates partial assistant messages
- [ ] Write test: `mergeDeltas()` handles single delta (no merge needed)
- [ ] Write test: `mergeDeltas()` returns correct total token count
- [ ] Add private `mergeDeltas(deltas: CheckpointDelta[]): { messages: Message[], tokenCount: number }` to SessionManager
- [ ] Sort deltas by checkpointIndex
- [ ] For each delta, append messages (handling continuation)
- [ ] If assistant message continues from previous, concatenate content
- [ ] Track and return final token count

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +70 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +35 lines)

**Success Criteria:**
- [ ] Messages merged in correct order
- [ ] Partial assistant messages concatenated correctly
- [ ] Single delta works without error
- [ ] Token count accurate
- [ ] All 4 merge tests pass

---

### Sub-phase 3.5: Implement recoverFromCheckpoints() Public Method

**Goal**: Combine all components into the public recovery method.

**Line Budget**: 80 lines (50 implementation + 30 tests)

#### Tasks
- [ ] Write test: `recoverFromCheckpoints()` returns empty when no checkpoints exist
- [ ] Write test: `recoverFromCheckpoints()` returns recovered conversation on success
- [ ] Write test: `recoverFromCheckpoints()` saves recovered conversation to SDK's S5
- [ ] Write test: `recoverFromCheckpoints()` throws when session not found
- [ ] Write test: `recoverFromCheckpoints()` propagates verification errors
- [ ] Write test: `recoverFromCheckpoints()` includes checkpoint metadata in result
- [ ] Implement public `recoverFromCheckpoints(sessionId: bigint): Promise<RecoveredConversation>`
- [ ] Get session info to obtain host address
- [ ] Call `fetchCheckpointIndex()` - return empty if null
- [ ] Call `verifyCheckpointIndex()` - throws on failure
- [ ] Fetch and verify all deltas
- [ ] Call `mergeDeltas()`
- [ ] Save recovered conversation to StorageManager
- [ ] Return RecoveredConversation with messages, tokenCount, checkpoints

**Test Files:**
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` (EXTEND, +100 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, +60 lines)

**Success Criteria:**
- [ ] No checkpoints returns `{ messages: [], tokenCount: 0, checkpoints: [] }`
- [ ] Valid checkpoints recover full conversation
- [ ] Conversation saved to SDK S5 storage
- [ ] Missing session throws `SESSION_NOT_FOUND`
- [ ] Verification errors propagated with descriptive messages
- [ ] All 6 recovery tests pass

---

## Phase 4: Node Checkpoint Publishing (Coordination Document)

**Note**: This phase documents required node changes. Implementation is done by node developer.

### Sub-phase 4.1: Node Implementation Spec

**Goal**: Create specification document for node developer.

**Line Budget**: Documentation only

#### Tasks
- [ ] Create `docs/NODE_CHECKPOINT_SPEC.md` with:
  - [ ] S5 path convention: `home/checkpoints/{hostAddress}/{sessionId}/index.json`
  - [ ] Delta format specification (CheckpointDelta JSON schema)
  - [ ] Index format specification (CheckpointIndex JSON schema)
  - [ ] Signature requirements (EIP-191, what to sign)
  - [ ] Timing requirements (store delta BEFORE proof submission)
  - [ ] Error handling (what to do if S5 upload fails)
  - [ ] Cleanup policy (when to delete old checkpoints)
- [ ] Include code examples in Python
- [ ] Add sequence diagram for checkpoint flow

**Implementation Files:**
- `docs/NODE_CHECKPOINT_SPEC.md` (NEW, ~200 lines)

**Success Criteria:**
- [ ] Spec document complete and clear
- [ ] All data formats documented with examples
- [ ] Signature format explicitly defined
- [ ] Ready to share with node developer

---

## Phase 5: Integration Testing

### Sub-phase 5.1: Mock Integration Tests

**Goal**: Test full recovery flow with mocked S5 and contract responses.

**Line Budget**: 150 lines (tests only)

#### Tasks
- [ ] Write test: Full flow - create session → mock checkpoints → recover
- [ ] Write test: Recovery with 1 checkpoint (single delta)
- [ ] Write test: Recovery with 5 checkpoints (multiple deltas)
- [ ] Write test: Recovery with mixed message types (user + assistant)
- [ ] Write test: Recovery fails gracefully when index missing
- [ ] Write test: Recovery fails gracefully when delta fetch fails
- [ ] Mock S5 responses for checkpoint index and deltas
- [ ] Mock contract responses for proof verification

**Test Files:**
- `packages/sdk-core/tests/integration/checkpoint-recovery.test.ts` (NEW, ~250 lines)

**Success Criteria:**
- [ ] All mock integration tests pass
- [ ] Full recovery flow tested end-to-end
- [ ] Error cases handled gracefully
- [ ] No flaky tests

---

### Sub-phase 5.2: E2E Testing with Real Node (After Node Implementation)

**Goal**: Test recovery with actual node publishing checkpoints.

**Line Budget**: 50 lines (test harness modifications)

#### Tasks
- [ ] Add "Test Recovery" button to chat-context-rag-demo.tsx
- [ ] Create test scenario: start session → send prompts → force timeout → recover
- [ ] Verify recovered messages match what was streamed
- [ ] Verify token count matches proof count
- [ ] Document manual test procedure

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, ~50 lines)

**Success Criteria:**
- [ ] Recovery button triggers `recoverFromCheckpoints()`
- [ ] Recovered conversation displayed in UI
- [ ] Token count matches expectation
- [ ] Manual test procedure documented

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

## Files Changed Summary

| File | Phase | Lines Added | Lines Modified |
|------|-------|-------------|----------------|
| `src/types/session.types.ts` | 1.1 | ~40 | 0 |
| `src/types/index.ts` | 1.1 | ~4 | 0 |
| `src/interfaces/ISessionManager.ts` | 1.2 | ~15 | 0 |
| `src/utils/signature.ts` | 2.1-2.2 | ~55 | 0 (new) |
| `src/utils/index.ts` | 2.1 | ~1 | 0 |
| `src/managers/SessionManager.ts` | 3.1-3.5 | ~225 | 0 |
| `tests/unit/checkpoint-types.test.ts` | 1.1-1.2 | ~60 | 0 (new) |
| `tests/unit/signature-verification.test.ts` | 2.1-2.2 | ~140 | 0 (new) |
| `tests/unit/checkpoint-recovery.test.ts` | 3.1-3.5 | ~450 | 0 (new) |
| `tests/integration/checkpoint-recovery.test.ts` | 5.1 | ~250 | 0 (new) |
| `docs/NODE_CHECKPOINT_SPEC.md` | 4.1 | ~200 | 0 (new) |
| `apps/harness/pages/chat-context-rag-demo.tsx` | 5.2 | ~50 | 0 |
| **Total** | | **~1490** | **0** |

---

## Test Coverage Target

| Test File | Tests | Status |
|-----------|-------|--------|
| `checkpoint-types.test.ts` | ~8 | [ ] |
| `signature-verification.test.ts` | ~9 | [ ] |
| `checkpoint-recovery.test.ts` | ~23 | [ ] |
| `checkpoint-recovery.test.ts` (integration) | ~6 | [ ] |
| **Total** | **~46** | [ ] |

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
| SDK Phase 1-3 | Not started | No |
| Node checkpoint publishing | Not started | Yes (for E2E tests) |
| S5 storage access | Available | No |
| Contract proof query | Available | No |

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
