# Implementation Plan: AUDIT Pre-Report Remediation

## Overview

Update SDK, Host CLI, and Test Harness to support the AUDIT pre-report security remediation. This addresses findings AUDIT-F1 through AUDIT-F5, with primary focus on:

- **AUDIT-F3**: `proofTimeoutWindow` parameter required for all session creation
- **AUDIT-F4**: `modelId` in proof signatures (node handles this, SDK just needs new ABIs)
- **AUDIT-F5**: New `createSessionFromDepositForModel()` function

## Status: Not Started

**Implementation**: AUDIT Pre-Report Remediation SDK Migration
**SDK Version**: 1.9.0 (target)
**Network**: Base Sepolia (Chain ID: 84532)
**Source Documents**:
- `docs/compute-contracts-reference/PRE-REPORT-REMEDIATION-SDK.md`
- `docs/compute-contracts-reference/BREAKING_CHANGES.md`
- `docs/node-reference/NODE_V8.13.0_AUDIT_F4_MIGRATION.md`

### Phases Overview:
- [ ] Phase 1: Contract Address & ABI Updates
- [ ] Phase 2: Type Definitions Update
- [ ] Phase 3: Session Creation Functions (AUDIT-F3)
- [ ] Phase 4: New createSessionFromDepositForModel (AUDIT-F5)
- [ ] Phase 5: S5 Seed Message Update
- [ ] Phase 6: Test Harness Updates
- [ ] Phase 7: Host CLI Updates
- [ ] Phase 8: Build, Test & Version Bump

---

## Summary of Contract Changes

| Change | Finding | SDK Impact |
|--------|---------|------------|
| `proofTimeoutWindow` parameter | AUDIT-F3 | **BREAKING** - All session creation |
| `modelId` in signatures | AUDIT-F4 | Node handles - SDK needs new ABIs |
| `createSessionFromDepositForModel` | AUDIT-F5 | Additive - New function |
| New contract addresses | - | **REQUIRED** - Config update |

### New Contract Addresses

| Contract | Old (Frozen) | New (Remediated) |
|----------|--------------|------------------|
| JobMarketplace | `0x3CaCbf3f448B420918A93a88706B26Ab27a3523E` | `0x95132177F964FF053C1E874b53CF74d819618E06` |
| ProofSystem | `0x5afB91977e69Cc5003288849059bc62d47E7deeb` | `0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31` |

### Session Creation Parameter Changes

| Function | Old Params | New Params |
|----------|------------|------------|
| `createSessionJob` | 4 | 5 (+proofTimeoutWindow) |
| `createSessionJobForModel` | 5 | 6 (+proofTimeoutWindow) |
| `createSessionJobWithToken` | 6 | 7 (+proofTimeoutWindow) |
| `createSessionJobForModelWithToken` | 7 | 8 (+proofTimeoutWindow) |
| `createSessionFromDeposit` | 6 | 7 (+proofTimeoutWindow) |
| `createSessionFromDepositForModel` | - | NEW (8 params) |

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Contract Address & ABI Updates

### Sub-phase 1.1: Copy New ABI Files

**Goal**: Replace SDK ABIs with updated contract ABIs from remediated contracts.

**Line Budget**: 0 lines code (file copy only)

#### Tasks
- [ ] Copy `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` to `packages/sdk-core/src/contracts/abis/`
- [ ] Copy `docs/compute-contracts-reference/client-abis/ProofSystemUpgradeable-CLIENT-ABI.json` to `packages/sdk-core/src/contracts/abis/`
- [ ] Verify new ABI contains `createSessionJob` with 5 parameters
- [ ] Verify new ABI contains `createSessionJobForModel` with 6 parameters
- [ ] Verify new ABI contains `createSessionJobWithToken` with 7 parameters
- [ ] Verify new ABI contains `createSessionJobForModelWithToken` with 8 parameters
- [ ] Verify new ABI contains `createSessionFromDeposit` with 7 parameters
- [ ] Verify new ABI contains `createSessionFromDepositForModel` (NEW function)
- [ ] Verify new ABI contains `MIN_PROOF_TIMEOUT`, `MAX_PROOF_TIMEOUT` constants

**Source Files:**
- `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- `docs/compute-contracts-reference/client-abis/ProofSystemUpgradeable-CLIENT-ABI.json`

**Destination Files:**
- `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- `packages/sdk-core/src/contracts/abis/ProofSystemUpgradeable-CLIENT-ABI.json`

**Success Criteria:**
- [ ] ABIs copied successfully
- [ ] New function signatures verified in ABI JSON
- [ ] No TypeScript compilation errors from ABI changes

---

### Sub-phase 1.2: Update Contract Addresses in ChainRegistry

**Goal**: Update ChainRegistry with new remediated contract addresses.

**Line Budget**: 10 lines (modifications only)

#### Tasks
- [ ] Write test: `ChainRegistry.getChain(84532).contracts.jobMarketplace` returns new address
- [ ] Write test: `ChainRegistry.getChain(84532).contracts.proofSystem` returns new address
- [ ] Update `jobMarketplace` address to `0x95132177F964FF053C1E874b53CF74d819618E06`
- [ ] Update `proofSystem` address to `0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31`
- [ ] Verify TypeScript compilation succeeds

**Test Files:**
- `packages/sdk-core/tests/unit/chain-registry-audit.test.ts` (NEW, ~20 lines)

**Implementation Files:**
- `packages/sdk-core/src/config/ChainRegistry.ts` (MODIFY, ~6 lines)

**Success Criteria:**
- [ ] JobMarketplace: `0x95132177F964FF053C1E874b53CF74d819618E06`
- [ ] ProofSystem: `0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31`
- [ ] Tests pass

---

### Sub-phase 1.3: Update ABI Fragments

**Goal**: Update inline ABI fragments in index.ts for new function signatures.

**Line Budget**: 20 lines (modifications only)

#### Tasks
- [ ] Update `createSessionJob` fragment to include 5th parameter
- [ ] Update `createSessionJobForModel` fragment to include 6th parameter
- [ ] Update `createSessionJobWithToken` fragment to include 7th parameter
- [ ] Update `createSessionJobForModelWithToken` fragment to include 8th parameter
- [ ] Update `createSessionFromDeposit` fragment to include 7th parameter
- [ ] Add `createSessionFromDepositForModel` fragment (NEW)
- [ ] Add `MIN_PROOF_TIMEOUT` constant fragment
- [ ] Add `MAX_PROOF_TIMEOUT` constant fragment

**Implementation Files:**
- `packages/sdk-core/src/contracts/abis/index.ts` (MODIFY, ~20 lines)

**Success Criteria:**
- [ ] All fragments match new ABI signatures
- [ ] TypeScript compilation succeeds

---

## Phase 2: Type Definitions Update

### Sub-phase 2.1: Add proofTimeoutWindow Constants

**Goal**: Add constants for proof timeout validation.

**Line Budget**: 15 lines

#### Tasks
- [ ] Write test: `MIN_PROOF_TIMEOUT` equals 60
- [ ] Write test: `MAX_PROOF_TIMEOUT` equals 3600
- [ ] Write test: `DEFAULT_PROOF_TIMEOUT` equals 300
- [ ] Add constants to `packages/sdk-core/src/contracts/JobMarketplace.ts`
- [ ] Export constants from index

**Test Files:**
- `packages/sdk-core/tests/unit/proof-timeout-constants.test.ts` (NEW, ~25 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~10 lines)

**Success Criteria:**
- [ ] Constants accessible via import
- [ ] Values match contract constants
- [ ] Tests pass

---

### Sub-phase 2.2: Update SessionCreationParams Interface

**Goal**: Add proofTimeoutWindow to session creation parameter types.

**Line Budget**: 25 lines

#### Tasks
- [ ] Write test: `SessionCreationParams` has optional `proofTimeoutWindow` field
- [ ] Write test: `DirectSessionParams` has optional `proofTimeoutWindow` field
- [ ] Write test: `proofTimeoutWindow` type is `number`
- [ ] Add `proofTimeoutWindow?: number` to `SessionCreationParams` interface
- [ ] Add `proofTimeoutWindow?: number` to `DirectSessionParams` interface
- [ ] Add JSDoc: "Timeout window in seconds (60-3600, default 300)"

**Test Files:**
- `packages/sdk-core/tests/unit/session-params-audit.test.ts` (NEW, ~30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~8 lines)

**Success Criteria:**
- [ ] Types compile correctly
- [ ] Optional parameter works
- [ ] Tests pass

---

### Sub-phase 2.3: Update PaymentManagerMultiChain Types

**Goal**: Add proofTimeoutWindow to payment manager types.

**Line Budget**: 15 lines

#### Tasks
- [ ] Write test: `SessionJobParams` (PaymentManager) has optional `proofTimeoutWindow`
- [ ] Add `proofTimeoutWindow?: number` to `SessionJobParams` interface
- [ ] Update JSDoc documentation

**Test Files:**
- `packages/sdk-core/tests/unit/payment-params-audit.test.ts` (NEW, ~20 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/PaymentManagerMultiChain.ts` (MODIFY, ~5 lines)

**Success Criteria:**
- [ ] Type exports correctly
- [ ] Tests pass

---

## Phase 3: Session Creation Functions (AUDIT-F3)

### Sub-phase 3.1: Update JobMarketplaceWrapper.createSessionJob()

**Goal**: Add proofTimeoutWindow parameter to ETH session creation.

**Line Budget**: 30 lines (modifications)

#### Tasks
- [ ] Write test: `createSessionJob()` passes proofTimeoutWindow to contract
- [ ] Write test: `createSessionJob()` uses DEFAULT_PROOF_TIMEOUT when not specified
- [ ] Write test: `createSessionJob()` throws when proofTimeoutWindow < 60
- [ ] Write test: `createSessionJob()` throws when proofTimeoutWindow > 3600
- [ ] Add proofTimeoutWindow validation logic
- [ ] Update contract call to include 5th parameter

**Test Files:**
- `packages/sdk-core/tests/unit/job-marketplace-audit.test.ts` (NEW, ~60 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~25 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow passed to contract
- [ ] Default value 300 when undefined
- [ ] Validation enforced
- [ ] Tests pass

---

### Sub-phase 3.2: Update createSessionJobForModel()

**Goal**: Add proofTimeoutWindow to ETH + model session creation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [ ] Write test: `createSessionJobForModel()` passes proofTimeoutWindow to contract
- [ ] Write test: `createSessionJobForModel()` uses DEFAULT_PROOF_TIMEOUT when not specified
- [ ] Update contract call to include 6th parameter

**Test Files:**
- `packages/sdk-core/tests/unit/job-marketplace-audit.test.ts` (EXTEND, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow passed to contract (6th param)
- [ ] Tests pass

---

### Sub-phase 3.3: Update createSessionJobWithToken()

**Goal**: Add proofTimeoutWindow to USDC session creation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [ ] Write test: `createSessionJobWithToken()` passes proofTimeoutWindow to contract
- [ ] Write test: `createSessionJobWithToken()` uses DEFAULT_PROOF_TIMEOUT when not specified
- [ ] Update contract call to include 7th parameter

**Test Files:**
- `packages/sdk-core/tests/unit/job-marketplace-audit.test.ts` (EXTEND, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow passed to contract (7th param)
- [ ] Tests pass

---

### Sub-phase 3.4: Update createSessionJobForModelWithToken()

**Goal**: Add proofTimeoutWindow to USDC + model session creation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [ ] Write test: `createSessionJobForModelWithToken()` passes proofTimeoutWindow
- [ ] Write test: Uses DEFAULT_PROOF_TIMEOUT when not specified
- [ ] Update contract call to include 8th parameter

**Test Files:**
- `packages/sdk-core/tests/unit/job-marketplace-audit.test.ts` (EXTEND, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow passed to contract (8th param)
- [ ] Tests pass

---

### Sub-phase 3.5: Update createSessionFromDeposit()

**Goal**: Add proofTimeoutWindow to deposit-based session creation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [ ] Write test: `createSessionFromDeposit()` passes proofTimeoutWindow to contract
- [ ] Write test: Uses DEFAULT_PROOF_TIMEOUT when not specified
- [ ] Update contract call to include 7th parameter

**Test Files:**
- `packages/sdk-core/tests/unit/job-marketplace-audit.test.ts` (EXTEND, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow passed to contract (7th param)
- [ ] Tests pass

---

### Sub-phase 3.6: Update PaymentManagerMultiChain

**Goal**: Pass proofTimeoutWindow through payment manager to wrapper.

**Line Budget**: 15 lines (modifications)

#### Tasks
- [ ] Write test: `PaymentManager.createSessionJob()` passes proofTimeoutWindow to wrapper
- [ ] Extract proofTimeoutWindow from params
- [ ] Pass to wrapper.createSessionFromDeposit() or wrapper.createSessionJob()

**Test Files:**
- `packages/sdk-core/tests/unit/payment-manager-audit.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/PaymentManagerMultiChain.ts` (MODIFY, ~12 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow flows through
- [ ] Tests pass

---

### Sub-phase 3.7: Update SessionManager.startSession()

**Goal**: Accept and pass proofTimeoutWindow in high-level session creation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [ ] Write test: `startSession()` accepts proofTimeoutWindow in config
- [ ] Write test: `startSession()` passes proofTimeoutWindow to paymentManager
- [ ] Add proofTimeoutWindow to sessionJobParams construction
- [ ] Update ExtendedSessionConfig interface if needed

**Test Files:**
- `packages/sdk-core/tests/unit/session-manager-audit.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (MODIFY, ~15 lines)

**Success Criteria:**
- [ ] proofTimeoutWindow flows from config to contract
- [ ] Tests pass

---

## Phase 4: New createSessionFromDepositForModel (AUDIT-F5)

### Sub-phase 4.1: Implement createSessionFromDepositForModel()

**Goal**: Add new function for model-specific deposit sessions.

**Line Budget**: 50 lines (new function)

#### Tasks
- [ ] Write test: `createSessionFromDepositForModel()` exists and is callable
- [ ] Write test: Requires modelId parameter (not optional)
- [ ] Write test: Passes all 8 parameters to contract
- [ ] Write test: Returns sessionId
- [ ] Write test: Throws when modelId is empty/zero
- [ ] Write test: Validates proofTimeoutWindow range
- [ ] Implement `createSessionFromDepositForModel(params)` function
- [ ] Add parameter validation
- [ ] Parse and pass all 8 contract parameters
- [ ] Extract sessionId from receipt events
- [ ] Export from JobMarketplace wrapper

**Test Files:**
- `packages/sdk-core/tests/unit/create-session-for-model.test.ts` (NEW, ~80 lines)

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~45 lines)

**Success Criteria:**
- [ ] Function callable
- [ ] All params passed correctly
- [ ] sessionId returned
- [ ] Tests pass

---

### Sub-phase 4.2: Add PaymentManager Support

**Goal**: Expose new function through PaymentManagerMultiChain.

**Line Budget**: 25 lines

#### Tasks
- [ ] Write test: `PaymentManager.createSessionFromDepositForModel()` exists
- [ ] Write test: Routes to wrapper function correctly
- [ ] Add method to PaymentManagerMultiChain
- [ ] Document in JSDoc

**Test Files:**
- `packages/sdk-core/tests/unit/payment-manager-model-deposit.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/PaymentManagerMultiChain.ts` (MODIFY, ~20 lines)

**Success Criteria:**
- [ ] Method accessible
- [ ] Tests pass

---

## Phase 5: S5 Seed Message Update

### Sub-phase 5.1: Update SEED_MESSAGE and CACHE_VERSION

**Goal**: Change seed derivation to create fresh S5 identities for testing.

**Line Budget**: 5 lines (modifications only)

#### Tasks
- [ ] Write test: `SEED_MESSAGE` contains 'v2.1 beta'
- [ ] Write test: `CACHE_VERSION` is 'v4'
- [ ] Update `SEED_MESSAGE` to `'Generate S5 seed for Fabstir LLM SDK v2.1 beta'`
- [ ] Update `CACHE_VERSION` to `'v4'`

**Test Files:**
- `packages/sdk-core/tests/unit/s5-seed-audit.test.ts` (NEW, ~20 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/s5-seed-derivation.ts` (MODIFY, 2 lines)

**Success Criteria:**
- [ ] New seed message active
- [ ] Old cached seeds invalidated
- [ ] Tests pass

---

## Phase 6: Test Harness Updates

### Sub-phase 6.1: Update chat-context-demo.tsx

**Goal**: Add proofTimeoutWindow to main demo page session config.

**Line Budget**: 10 lines (modifications)

#### Tasks
- [ ] Locate sessionConfig object (~line 150-160)
- [ ] Add `proofTimeoutWindow: 300` to sessionConfig
- [ ] Verify page loads without errors
- [ ] Test session creation manually

**Implementation Files:**
- `apps/harness/pages/chat-context-demo.tsx` (MODIFY, ~3 lines)

**Success Criteria:**
- [ ] Page compiles
- [ ] Session creation works
- [ ] No console errors

---

### Sub-phase 6.2: Update chat-context-rag-demo.tsx

**Goal**: Add proofTimeoutWindow to RAG demo page session config.

**Line Budget**: 10 lines (modifications)

#### Tasks
- [ ] Locate sessionConfig object
- [ ] Add `proofTimeoutWindow: 300` to sessionConfig
- [ ] Verify page loads without errors

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, ~3 lines)

**Success Criteria:**
- [ ] Page compiles
- [ ] Session creation works

---

### Sub-phase 6.3: Update Other Test Pages

**Goal**: Add proofTimeoutWindow to remaining test pages.

**Line Budget**: 20 lines total

#### Tasks
- [ ] Update `usdc-mvp-flow-sdk.test.tsx` - add proofTimeoutWindow
- [ ] Update `eth-mvp-flow-sdk.test.tsx` - add proofTimeoutWindow
- [ ] Update `base-usdc-mvp-flow-sdk.test.tsx` - add proofTimeoutWindow

**Implementation Files:**
- `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx` (MODIFY, ~3 lines)
- `apps/harness/pages/eth-mvp-flow-sdk.test.tsx` (MODIFY, ~3 lines)
- `apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx` (MODIFY, ~3 lines)

**Success Criteria:**
- [ ] All pages compile
- [ ] No session creation errors

---

### Sub-phase 6.4: Update Harness Environment

**Goal**: Update .env.local with new contract addresses.

**Line Budget**: 0 lines code (config only)

#### Tasks
- [ ] Update `NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE` to new address
- [ ] Update `NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM` to new address
- [ ] Verify environment loads correctly

**Implementation Files:**
- `apps/harness/.env.local` (MODIFY, 2 lines)

**Success Criteria:**
- [ ] New addresses active
- [ ] Pages connect to correct contracts

---

## Phase 7: Host CLI Updates

### Sub-phase 7.1: Copy ABIs to Host CLI

**Goal**: Ensure Host CLI has updated ABIs.

**Line Budget**: 0 lines code (file copy only)

#### Tasks
- [ ] Check if Host CLI has separate ABI copies
- [ ] Copy updated ABIs if needed
- [ ] Verify registration still works

**Implementation Files:**
- `packages/host-cli/src/contracts/abis/` (if exists)

**Success Criteria:**
- [ ] ABIs consistent with SDK
- [ ] CLI commands work

---

### Sub-phase 7.2: Verify CLI Commands

**Goal**: Ensure Host CLI commands work with new contracts.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [ ] Test `register` command
- [ ] Test `update-pricing` command
- [ ] Test `status` command
- [ ] Document any issues

**Success Criteria:**
- [ ] All commands functional
- [ ] No breaking changes needed

---

## Phase 8: Build, Test & Version Bump

### Sub-phase 8.1: Run All Unit Tests

**Goal**: Verify all unit tests pass.

**Line Budget**: 0 lines

#### Tasks
- [ ] Run `pnpm test` in sdk-core
- [ ] Fix any failing tests
- [ ] Document test count

**Success Criteria:**
- [ ] All tests pass
- [ ] No regressions

---

### Sub-phase 8.2: Rebuild SDK

**Goal**: Build SDK with all changes.

**Line Budget**: 0 lines

#### Tasks
- [ ] Run `pnpm build:esm && pnpm build:cjs`
- [ ] Verify no build errors
- [ ] Check bundle sizes

**Success Criteria:**
- [ ] Build succeeds
- [ ] dist/ files generated

---

### Sub-phase 8.3: Integration Testing

**Goal**: End-to-end test with new contracts.

**Line Budget**: 0 lines

#### Tasks
- [ ] Start test harness server
- [ ] Open chat-context-demo page
- [ ] Connect wallet (fresh S5 identity)
- [ ] Create session (verify proofTimeoutWindow passed)
- [ ] Send message and receive response
- [ ] End session and verify settlement

**Success Criteria:**
- [ ] Full flow works
- [ ] Host paid correctly
- [ ] No console errors

---

### Sub-phase 8.4: Version Bump

**Goal**: Bump SDK version for release.

**Line Budget**: 2 lines

#### Tasks
- [ ] Update version in `packages/sdk-core/package.json`
- [ ] Update CHANGELOG if exists

**Implementation Files:**
- `packages/sdk-core/package.json` (MODIFY, 1 line)

**Success Criteria:**
- [ ] Version: 1.9.0

---

## Verification Checklist

### Contract Integration
- [ ] JobMarketplace address: `0x95132177F964FF053C1E874b53CF74d819618E06`
- [ ] ProofSystem address: `0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31`
- [ ] ABIs match deployed contracts

### Session Creation
- [ ] All 5 existing functions accept proofTimeoutWindow
- [ ] Default value 300 (5 minutes) applied
- [ ] Validation: 60 ≤ proofTimeoutWindow ≤ 3600
- [ ] New createSessionFromDepositForModel works

### S5 Storage
- [ ] New seed message: 'Generate S5 seed for Fabstir LLM SDK v2.1 beta'
- [ ] Fresh identity on wallet connect
- [ ] Old cached seeds invalidated

### Test Harness
- [ ] chat-context-demo works end-to-end
- [ ] chat-context-rag-demo works
- [ ] All test pages compile

---

## File Summary

| Phase | File | Change Type | Lines |
|-------|------|-------------|-------|
| 1.1 | ABIs (2 files) | COPY | 0 |
| 1.2 | ChainRegistry.ts | MODIFY | ~6 |
| 1.3 | abis/index.ts | MODIFY | ~20 |
| 2.1 | JobMarketplace.ts | MODIFY | ~10 |
| 2.2 | JobMarketplace.ts | MODIFY | ~8 |
| 2.3 | PaymentManagerMultiChain.ts | MODIFY | ~5 |
| 3.1-3.5 | JobMarketplace.ts | MODIFY | ~90 |
| 3.6 | PaymentManagerMultiChain.ts | MODIFY | ~12 |
| 3.7 | SessionManager.ts | MODIFY | ~15 |
| 4.1 | JobMarketplace.ts | MODIFY | ~45 |
| 4.2 | PaymentManagerMultiChain.ts | MODIFY | ~20 |
| 5.1 | s5-seed-derivation.ts | MODIFY | 2 |
| 6.1-6.3 | Test pages (5 files) | MODIFY | ~15 |
| 6.4 | .env.local | MODIFY | 2 |
| 8.4 | package.json | MODIFY | 1 |

**Total New Test Lines**: ~400+ lines
**Total Implementation Lines**: ~250 lines

---

## Notes

- Node already handles AUDIT-F4 (modelId in signatures) - SDK just needs new ABIs
- No migration needed - pre-MVP with fresh contracts
- Old cached S5 seeds will be invalidated by new SEED_MESSAGE
