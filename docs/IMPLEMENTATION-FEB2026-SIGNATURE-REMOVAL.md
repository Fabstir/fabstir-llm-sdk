# Implementation Plan: February 2026 Signature Removal & Contract Updates

## Overview

Update SDK to support the February 2026 contract changes:
- **Signature Removal**: `submitProofOfWork` no longer requires ECDSA signature (6→5 params)
- **V2 Direct Payment Delegation**: New functions for Smart Wallet sub-accounts
- **Early Cancellation Fee**: `minTokensFee()` query
- **Node v8.14.2 Model Validation**: Transparent server-side changes (no SDK impact)

## Status: Complete (awaiting manual harness testing)

**Implementation**: February 2026 Contract Migration
**SDK Version**: 1.11.0 (target)
**Network**: Base Sepolia (Chain ID: 84532)
**Source Documents**:
- `docs/compute-contracts-reference/SDK-MIGRATION-JAN2026.md`
- `docs/compute-contracts-reference/BREAKING_CHANGES.md`
- `docs/compute-contracts-reference/client-abis/CHANGELOG.md`
- `docs/node-reference/MODEL-VALIDATION-SDK-COMPATIBILITY.md`

### Phases Overview:
- [x] Phase 1: Update Contract ABIs
- [x] Phase 2: Remove Signature from Proof Submission (BREAKING)
- [x] Phase 3: Update Types & Constants
- [x] Phase 4: Add V2 Direct Payment Delegation
- [x] Phase 5: Add Early Cancellation Fee Query
- [x] Phase 6: Optional Model Validation Helpers
- [x] Phase 7: Update Tests
- [x] Phase 8: Build, Test & Version Bump

---

## Summary of Contract Changes

| Change | Impact | SDK Action |
|--------|--------|------------|
| `submitProofOfWork` signature REMOVED | **BREAKING** | Remove signature param (6→5) |
| `getProofSubmission` returns 5 values | **BREAKING** | Add deltaCID to result |
| ProofSystem verification functions removed | Medium | Remove direct calls if any |
| V2 Delegation functions added | Additive | Add new methods |
| `minTokensFee()` added | Additive | Add query method |
| Per-model rate limits added | Additive | Optional integration |

### Contract Addresses (Unchanged)

| Contract | Address |
|----------|---------|
| JobMarketplace (Remediation) | `0x95132177F964FF053C1E874b53CF74d819618E06` |
| ProofSystem (Remediation) | `0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31` |
| NodeRegistry | `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22` |
| ModelRegistry | `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2` |
| HostEarnings | `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0` |

### submitProofOfWork Parameter Changes

| Version | Parameters |
|---------|------------|
| OLD (6 params) | jobId, tokensClaimed, proofHash, **signature**, proofCID, deltaCID |
| NEW (5 params) | jobId, tokensClaimed, proofHash, proofCID, deltaCID |

**Why removed?** Authentication is now via `msg.sender == session.host` check, providing equivalent security with ~3,000 gas savings.

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Update Contract ABIs

### Sub-phase 1.1: Copy New ABI Files

**Goal**: Replace SDK ABIs with updated contract ABIs (signature removed).

**Line Budget**: 0 lines code (file copy only)

#### Tasks
- [x] Copy `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` to `packages/sdk-core/src/contracts/abis/`
- [x] Copy `docs/compute-contracts-reference/client-abis/ProofSystemUpgradeable-CLIENT-ABI.json` to `packages/sdk-core/src/contracts/abis/`
- [x] Verify new ABI: `submitProofOfWork` has 5 parameters (no signature)
- [x] Verify new ABI: `getProofSubmission` returns 5 values (includes deltaCID)
- [x] Verify new ABI: `markProofUsed(bytes32)` exists in ProofSystem
- [x] Verify REMOVED: `verifyHostSignature`, `verifyAndMarkComplete` not in ProofSystem
- [x] Verify new ABI: V2 delegation functions exist (`authorizeDelegate`, `createSessionForModelAsDelegate`, etc.)
- [x] Verify new ABI: `minTokensFee()` exists

**Source Files:**
- `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- `docs/compute-contracts-reference/client-abis/ProofSystemUpgradeable-CLIENT-ABI.json`

**Destination Files:**
- `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- `packages/sdk-core/src/contracts/abis/ProofSystemUpgradeable-CLIENT-ABI.json`

**Success Criteria:**
- [x] ABIs copied successfully
- [x] New function signatures verified in ABI JSON
- [x] No TypeScript compilation errors from ABI changes

---

### Sub-phase 1.2: Update ABI Fragments in index.ts

**Goal**: Update inline ABI fragments to match new signatures.

**Line Budget**: 15 lines (modifications only)

#### Tasks
- [x] Update `submitProofOfWork` fragment: remove signature parameter (5 params)
- [x] Update `getProofSubmission` fragment: add deltaCID to return tuple (5 values)
- [x] Add `authorizeDelegate` fragment
- [x] Add `isDelegateAuthorized` fragment
- [x] Add `createSessionForModelAsDelegate` fragment
- [x] Add `createSessionAsDelegate` fragment
- [x] Add `minTokensFee` fragment

**Implementation Files:**
- `packages/sdk-core/src/contracts/abis/index.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [x] All fragments match new ABI signatures
- [x] TypeScript compilation succeeds

---

## Phase 2: Remove Signature from Proof Submission (BREAKING)

### Sub-phase 2.1: Deprecate ProofSigner.ts

**Goal**: Mark ProofSigner as deprecated since signatures are no longer needed.

**Line Budget**: 20 lines (modifications only)

#### Tasks
- [x] Write test: `signProofForSubmission()` logs deprecation warning
- [x] Write test: `signProofForSubmission()` returns proofHash with empty signature
- [x] Add `@deprecated` JSDoc to `signProofForSubmission()` function
- [x] Add `console.warn()` deprecation message on call
- [x] Return `signature: '0x'` (empty) instead of generating signature
- [x] Keep function for backward compatibility (no removal)

**Test Files:**
- `packages/sdk-core/tests/unit/proof-signer-deprecated.test.ts` (NEW, ~25 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/ProofSigner.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Deprecation warning logged
- [x] Function still callable (backward compat)

---

### Sub-phase 2.2: Update SessionJobManager.submitCheckpointProof()

**Goal**: Remove signature parameter from submitCheckpointProof method.

**Line Budget**: 30 lines (modifications only)

#### Tasks
- [x] Write test: `submitCheckpointProof()` accepts 5 params (no signature)
- [x] Write test: `submitCheckpointProof()` calls contract with correct 5 params
- [x] Write test: `submitCheckpointProof()` accepts deltaCID parameter
- [x] Write test: `submitCheckpointProof()` uses empty string for deltaCID default
- [x] Remove `signature` parameter from `submitCheckpointProof()` method
- [x] Add `deltaCID: string = ""` parameter
- [x] Update contract call to 5 params: (sessionId, tokensClaimed, proofHash, proofCID, deltaCID)
- [x] Update JSDoc documentation

**Test Files:**
- `packages/sdk-core/tests/unit/session-job-manager-proof.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~25 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method signature updated
- [x] Contract called with 5 params
- [x] TypeScript compilation succeeds

---

### Sub-phase 2.3: Update SessionJobManager.submitCheckpointProofAsHost()

**Goal**: Remove signature parameter from submitCheckpointProofAsHost method.

**Line Budget**: 25 lines (modifications only)

#### Tasks
- [x] Write test: `submitCheckpointProofAsHost()` accepts 6 params (no signature)
- [x] Write test: Contract called with correct params
- [x] Remove `signature` parameter from method
- [x] Add `deltaCID: string = ""` parameter
- [x] Update contract call
- [x] Update JSDoc

**Test Files:**
- `packages/sdk-core/tests/unit/session-job-manager-proof-host.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~20 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method signature updated
- [x] Contract called correctly

---

### Sub-phase 2.4: Update SessionJobManager.getProofSubmission()

**Goal**: Update getProofSubmission to return 5 values including deltaCID.

**Line Budget**: 15 lines (modifications only)

#### Tasks
- [x] Write test: `getProofSubmission()` returns object with deltaCID field
- [x] Write test: deltaCID is string type
- [x] Update destructuring to include 5th value (deltaCID)
- [x] Add deltaCID to return object
- [x] Update return type in interface

**Test Files:**
- `packages/sdk-core/tests/unit/session-job-manager-get-proof.test.ts` (NEW, ~30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~10 lines)

**Success Criteria:**
- [x] Tests pass
- [x] deltaCID included in return
- [x] Type correct

---

## Phase 3: Update Types & Constants

### Sub-phase 3.1: Update proof.types.ts

**Goal**: Update proof type definitions for new contract signatures.

**Line Budget**: 20 lines (modifications only)

#### Tasks
- [x] Write test: `ProofSubmissionParams.signature` is optional (deprecated)
- [x] Write test: `ProofSubmissionParams.deltaCID` exists and is optional
- [x] Write test: `ProofSubmissionResult.deltaCID` exists and is string
- [x] Add `@deprecated` JSDoc to `signature` field
- [x] Make `signature?: string` optional
- [x] Add `deltaCID?: string` to ProofSubmissionParams
- [x] Add `deltaCID: string` to ProofSubmissionResult

**Test Files:**
- `packages/sdk-core/tests/unit/proof-types.test.ts` (MODIFY, ~30 lines)

**Implementation Files:**
- `packages/sdk-core/src/types/proof.types.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Types compile correctly
- [x] Deprecated field marked

---

### Sub-phase 3.2: Add Delegation Error Types

**Goal**: Add custom error types for V2 delegation.

**Line Budget**: 25 lines (new file or additions)

#### Tasks
- [x] Write test: `DELEGATION_ERRORS` constants exist
- [x] Write test: `parseDelegationError()` returns correct messages
- [x] Create or add to errors file: `DELEGATION_ERRORS` object
- [x] Add `parseDelegationError()` helper function
- [x] Export from index

**Test Files:**
- `packages/sdk-core/tests/unit/delegation-errors.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/types/errors.ts` (NEW, ~40 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Error constants accessible
- [x] Parser function works

---

## Phase 4: Add V2 Direct Payment Delegation

### Sub-phase 4.1: Add authorizeDelegate() Method

**Goal**: Add method to authorize delegates for session creation.

**Line Budget**: 20 lines

#### Tasks
- [x] Write test: `authorizeDelegate()` method exists
- [x] Write test: calls contract with correct params (delegate, authorized)
- [x] Write test: returns transaction hash
- [x] Add `authorizeDelegate(delegate: string, authorized: boolean): Promise<string>` method
- [x] Implement contract call
- [x] Add JSDoc documentation

**Test Files:**
- `packages/sdk-core/tests/unit/delegation-authorize.test.ts` (NEW, ~35 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method callable
- [x] Contract called correctly

---

### Sub-phase 4.2: Add isDelegateAuthorized() Method

**Goal**: Add query method to check delegate authorization.

**Line Budget**: 15 lines

#### Tasks
- [x] Write test: `isDelegateAuthorized()` method exists
- [x] Write test: returns boolean
- [x] Write test: calls contract with correct params (payer, delegate)
- [x] Add `isDelegateAuthorized(payer: string, delegate: string): Promise<boolean>` method
- [x] Implement contract call
- [x] Add JSDoc

**Test Files:**
- `packages/sdk-core/tests/unit/delegation-check.test.ts` (NEW, ~30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~10 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method callable
- [x] Returns correct type

---

### Sub-phase 4.3: Add createSessionForModelAsDelegate() Method

**Goal**: Add method to create sessions as delegate for payer.

**Line Budget**: 45 lines

#### Tasks
- [x] Write test: `createSessionForModelAsDelegate()` method exists
- [x] Write test: accepts all 9 params (payer, modelId, host, paymentToken, amount, pricePerToken, maxDuration, proofInterval, proofTimeoutWindow)
- [x] Write test: returns SessionResult with sessionId
- [x] Write test: parses SessionCreatedByDelegate event
- [x] Add method with full signature
- [x] Implement contract call
- [x] Parse event for sessionId
- [x] Add comprehensive JSDoc

**Test Files:**
- `packages/sdk-core/tests/unit/delegation-create-session.test.ts` (NEW, ~60 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~40 lines)

**Success Criteria:**
- [x] Tests pass
- [x] All params passed correctly
- [x] sessionId returned
- [x] Error handling works

---

### Sub-phase 4.4: Add createSessionAsDelegate() Method (Non-Model)

**Goal**: Add non-model version of delegate session creation.

**Line Budget**: 40 lines

#### Tasks
- [x] Write test: `createSessionAsDelegate()` method exists
- [x] Write test: accepts 8 params (no modelId)
- [x] Write test: returns SessionResult
- [x] Add method with signature
- [x] Implement contract call
- [x] Parse event
- [x] Add JSDoc

**Test Files:**
- `packages/sdk-core/tests/unit/delegation-create-session-nonmodel.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~35 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method callable
- [x] Works without modelId

---

## Phase 5: Add Early Cancellation Fee Query

### Sub-phase 5.1: Add getMinTokensFee() Method

**Goal**: Add method to query minimum token fee for early cancellation.

**Line Budget**: 15 lines

#### Tasks
- [x] Write test: `getMinTokensFee()` method exists
- [x] Write test: returns bigint
- [x] Write test: calls contract correctly
- [x] Add `getMinTokensFee(): Promise<bigint>` method
- [x] Implement contract call
- [x] Add JSDoc explaining fee calculation

**Test Files:**
- `packages/sdk-core/tests/unit/early-cancellation-fee.test.ts` (NEW, ~25 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/SessionJobManager.ts` (MODIFY, ~12 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method callable
- [x] Returns correct type

---

## Phase 6: Optional Model Validation Helpers

### Sub-phase 6.1: Add validateHostSupportsModel() Helper

**Goal**: Add pre-flight validation helper for better UX.

**Line Budget**: 20 lines

#### Tasks
- [x] Write test: `validateHostSupportsModel()` method exists on HostManager
- [x] Write test: returns boolean
- [x] Write test: calls nodeRegistry.nodeSupportsModel()
- [x] Add method to HostManager
- [x] Implement contract call
- [x] Add JSDoc explaining use case

**Test Files:**
- `packages/sdk-core/tests/unit/host-model-validation.test.ts` (NEW, ~35 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method callable
- [x] Returns accurate result

---

### Sub-phase 6.2: Add getHostSupportedModels() Helper

**Goal**: Add method to get all models a host supports.

**Line Budget**: 15 lines

#### Tasks
- [x] Write test: `getHostSupportedModels()` method exists
- [x] Write test: returns array of model IDs (bytes32)
- [x] Add method to HostManager
- [x] Implement contract call
- [x] Add JSDoc

**Test Files:**
- `packages/sdk-core/tests/unit/host-supported-models.test.ts` (NEW, ~30 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (MODIFY, ~12 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Method callable
- [x] Returns correct type

---

## Phase 7: Update Tests

### Sub-phase 7.1: Update Existing Unit Tests

**Goal**: Update existing tests that use old signature-based proof submission.

**Line Budget**: 50 lines (modifications across files)

#### Tasks
- [x] Update `session-job-manager.test.ts`: remove signature from submitCheckpointProof calls
- [x] Update `abi-fragments.test.ts`: update expected signatures
- [x] Update `proof-signer.test.ts`: add deprecation tests
- [x] Update `checkpoint-recovery.test.ts`: NOT NEEDED - uses different signatures (checkpoint indexing)
- [x] Verify all unit tests pass

**Test Files (MODIFY):**
- `packages/sdk-core/tests/unit/session-job-manager.test.ts` (~30 lines)
- `packages/sdk-core/tests/unit/abi-fragments.test.ts` (~10 lines)
- `packages/sdk-core/tests/unit/proof-signer.test.ts` (~60 lines - rewritten for deprecation)
- `packages/sdk-core/tests/unit/checkpoint-recovery.test.ts` - NO CHANGE (different signatures)

**Success Criteria:**
- [x] All existing tests updated
- [x] No references to signature param in proof submission
- [x] All tests pass

---

### Sub-phase 7.2: Create Integration Test

**Goal**: Create integration test for Feb 2026 contract changes.

**Line Budget**: 80 lines (new file)

#### Tasks
- [x] Create `feb2026-contract-upgrade.test.ts`
- [x] Test: proof submission without signature works (type verification)
- [x] Test: getProofSubmission returns deltaCID (type verification)
- [x] Test: delegation flow works (error types verification)
- [x] Test: minTokensFee fragment exists
- [x] Skip tests that require live contract (marked as .skip)

**Test Files:**
- `packages/sdk-core/tests/integration/feb2026-contract-upgrade.test.ts` (NEW, ~80 lines)

**Success Criteria:**
- [x] Test file created
- [x] All scenarios covered
- [x] Tests pass (7 pass, 3 skipped for CI)

---

## Phase 8: Build, Test & Version Bump

### Sub-phase 8.1: Run All Unit Tests

**Goal**: Verify all unit tests pass.

**Line Budget**: 0 lines

#### Tasks
- [x] Run `pnpm test` in packages/sdk-core
- [x] Fix any failing tests (all Feb 2026 tests pass)
- [x] Verify test coverage maintained (94 tests, 17 test files)

**Success Criteria:**
- [x] All Feb 2026 unit tests pass (94 passed, 3 skipped)
- [x] No regressions from Feb 2026 changes

---

### Sub-phase 8.2: Rebuild SDK

**Goal**: Build SDK with all changes.

**Line Budget**: 0 lines

#### Tasks
- [x] Run `pnpm build:esm && pnpm build:cjs`
- [x] Verify no compilation errors (3 pre-existing warnings only)
- [x] Check bundle sizes: ESM 943.8kb, CJS 961.1kb

**Success Criteria:**
- [x] Build succeeds
- [x] dist/ files generated

---

### Sub-phase 8.3: Update Documentation

**Goal**: Update SDK documentation.

**Line Budget**: 30 lines

#### Tasks
- [x] Update `docs/SDK_API.md`: update submitCheckpointProof signature (no ECDSA sig)
- [x] Update `docs/SDK_API.md`: add V2 delegation documentation
- [x] CLAUDE.local.md: already up to date (contract info in compute-contracts-reference)

**Implementation Files:**
- `docs/SDK_API.md` (MODIFY, ~45 lines)

**Success Criteria:**
- [x] Docs accurate
- [x] No references to signature generation for proofs

---

### Sub-phase 8.4: Version Bump

**Goal**: Bump SDK version for release.

**Line Budget**: 1 line

#### Tasks
- [x] Update version in `packages/sdk-core/package.json` from 1.10.2 to 1.11.0
- [x] Run `pnpm install --force`

**Implementation Files:**
- `packages/sdk-core/package.json` (MODIFY, 1 line)

**Success Criteria:**
- [x] Version: 1.11.0

---

### Sub-phase 8.5: Integration Testing with Test Harness

**Goal**: End-to-end test with new contract behavior.

**Line Budget**: 0 lines

**Status**: Manual testing required by user

#### Tasks
- [ ] Start test harness server
- [ ] Open chat-context-demo page
- [ ] Connect wallet
- [ ] Create session
- [ ] Verify proof submission works (no signature popup)
- [ ] End session and verify settlement

**Success Criteria:**
- [ ] Full flow works
- [ ] No signature errors
- [ ] Settlement succeeds

---

## Verification Checklist

### Contract Integration
- [x] ABIs updated with signature removal
- [x] submitProofOfWork takes 5 params
- [x] getProofSubmission returns 5 values
- [x] V2 delegation functions available
- [x] minTokensFee query available

### Proof Submission
- [x] ProofSigner.ts deprecated with warning
- [x] submitCheckpointProof() takes no signature
- [x] submitCheckpointProofAsHost() takes no signature
- [x] deltaCID parameter supported

### V2 Delegation
- [x] authorizeDelegate() works
- [x] isDelegateAuthorized() works
- [x] createSessionForModelAsDelegate() works
- [x] createSessionAsDelegate() works

### Model Validation (Optional)
- [x] validateHostSupportsModel() available
- [x] getHostSupportedModels() available

### Tests
- [x] All Feb 2026 unit tests pass (94 tests)
- [x] Integration test created
- [x] No regression from Feb 2026 changes

---

## File Summary

| Phase | File | Change Type | Lines |
|-------|------|-------------|-------|
| 1.1 | ABIs (2 files) | COPY | 0 |
| 1.2 | abis/index.ts | MODIFY | ~15 |
| 2.1 | ProofSigner.ts | MODIFY | ~15 |
| 2.2 | SessionJobManager.ts | MODIFY | ~25 |
| 2.3 | SessionJobManager.ts | MODIFY | ~20 |
| 2.4 | SessionJobManager.ts | MODIFY | ~10 |
| 3.1 | proof.types.ts | MODIFY | ~15 |
| 3.2 | errors.ts | NEW/MODIFY | ~20 |
| 4.1 | SessionJobManager.ts | MODIFY | ~15 |
| 4.2 | SessionJobManager.ts | MODIFY | ~10 |
| 4.3 | SessionJobManager.ts | MODIFY | ~40 |
| 4.4 | SessionJobManager.ts | MODIFY | ~35 |
| 5.1 | SessionJobManager.ts | MODIFY | ~12 |
| 6.1 | HostManager.ts | MODIFY | ~15 |
| 6.2 | HostManager.ts | MODIFY | ~12 |
| 7.1 | Test files (4) | MODIFY | ~50 |
| 7.2 | Integration test | NEW | ~80 |
| 8.3 | Docs (2 files) | MODIFY | ~30 |
| 8.4 | package.json | MODIFY | 1 |

**Total New Test Lines**: ~500+ lines
**Total Implementation Lines**: ~250 lines

---

## Notes

- **No signature generation needed**: Hosts just call submitProofOfWork directly
- **Backward compatibility**: ProofSigner kept but deprecated
- **Pre-MVP**: No migration of existing data needed
- **Node v8.14.2**: Model validation is server-side, transparent to SDK
- **Gas savings**: ~3,000 gas per proof submission (no ecrecover)

---

## Dependencies

- Requires updated ABIs from contracts developer
- Requires node v8.14.2+ for model validation features
- Test harness needs SDK rebuild before testing
