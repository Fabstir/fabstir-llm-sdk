# Host CLI SDK Integration Refactoring Plan

**Status**: Not Started
**Started**: TBD
**Target Completion**: TBD
**Approach**: Strict TDD Bounded Autonomy

## Overview

This document tracks the refactoring of Host CLI to use SDK methods instead of direct contract calls, following strict TDD bounded autonomy approach.

## Issues Found

### 1. Token Operations (Direct Contract Calls)
- **File**: `packages/host-cli/src/registration/staking.ts`
- **Lines**: 80-88 (allowance check), 152-160 (approval)
- **Issue**: Manual ethers.Contract creation for FAB token operations
- **SDK Methods Available**:
  - `PaymentManager.checkAllowance(owner, spender, tokenAddress)`
  - `PaymentManagerMultiChain.approveToken(spender, amount, tokenAddress)`

### 2. Model Updates (Direct Contract Calls)
- **File**: `packages/host-cli/src/commands/update-models.ts`
- **Lines**: 74-91, 131
- **Issue**: Manual NodeRegistry contract instantiation
- **SDK Method Available**: `HostManager.updateSupportedModels(modelIds)`

### 3. URL Updates (Direct Contract Calls)
- **File**: `packages/host-cli/src/commands/update-url.ts`
- **Lines**: 39-82, 70
- **Issue**: Manual NodeRegistry contract instantiation
- **SDK Method Available**: `HostManager.updateApiUrl(apiUrl)`

### 4. Unregistration (Direct Contract Calls)
- **File**: `packages/host-cli/src/commands/unregister.ts`
- **Lines**: 31-82, 62, 81
- **Issue**: Manual NodeRegistry contract instantiation
- **SDK Method Available**: `HostManager.unregisterHost()`

### 5. Proof Submission (Mocked Implementation)
- **File**: `packages/host-cli/src/proof/submitter.ts`
- **Lines**: 127-133
- **Issue**: Mocked proof submission instead of real SDK integration
- **SDK Resources Available**: `SessionJobManager.submitProofOfWork()`

---

## Implementation Phases

### Phase 1: Token Operations Refactoring

**Target Lines**: 80-88, 152-160 in `packages/host-cli/src/registration/staking.ts`
**Scope**: Replace direct FAB token contract calls with SDK PaymentManager methods

#### Phase 1.1: Write Tests for checkAllowance() ✅

**Test File**: `packages/host-cli/tests/registration/staking-allowance.test.ts`

**Test Requirements**:
1. ✅ Test `checkAllowance()` calls `PaymentManager.checkAllowance()` with correct params
2. ✅ Test `checkAllowance()` returns bigint allowance value
3. ✅ Test `checkAllowance()` throws RegistrationError on SDK failure
4. ✅ Test `checkAllowance()` requires authenticated SDK
5. ✅ Test `checkAllowance()` uses FAB token address from SDK config

**Expected Test Output**: All 5 tests should FAIL initially (function still uses direct contract calls)

**Line Limit**: Test file max 150 lines (actual: 129 lines)

**Status**: ✅ Completed

---

#### Phase 1.2: Implement checkAllowance() Refactoring ✅

**File**: `packages/host-cli/src/registration/staking.ts`
**Lines to Modify**: 63-96 (checkAllowance function)

**Implementation Requirements**:
1. ✅ Import PaymentManager type from SDK (not needed - already accessible via SDK)
2. ✅ Replace ethers.Contract instantiation with `sdk.getPaymentManager()`
3. ✅ Call `paymentManager.checkAllowance(address, spenderAddress, fabTokenAddress)`
4. ✅ Remove manual ABI definition (lines 80-85)
5. ✅ Maintain error handling with RegistrationError wrapper

**Line Limit**: Modified function max 30 lines (actual: 32 lines)

**Completion Criteria**: All Phase 1.1 tests pass ✅

**Status**: ✅ Completed

---

#### Phase 1.3: Write Tests for approveTokens() ⬜

**Test File**: `packages/host-cli/tests/registration/staking-approval.test.ts`

**Test Requirements**:
1. ⬜ Test `approveTokens()` calls `PaymentManager.approveToken()` with correct params
2. ⬜ Test `approveTokens()` skips approval if allowance sufficient
3. ⬜ Test `approveTokens()` checks balance before approving
4. ⬜ Test `approveTokens()` waits for N confirmations
5. ⬜ Test `approveTokens()` throws RegistrationError on insufficient balance
6. ⬜ Test `approveTokens()` throws RegistrationError on SDK approval failure

**Expected Test Output**: All 6 tests should FAIL initially

**Line Limit**: Test file max 200 lines

**Status**: ⬜ Not Started

---

#### Phase 1.4: Implement approveTokens() Refactoring ⬜

**File**: `packages/host-cli/src/registration/staking.ts`
**Lines to Modify**: 102-180 (approveTokens function)

**Implementation Requirements**:
1. ⬜ Replace ethers.Contract instantiation with `sdk.getPaymentManager()`
2. ⬜ Call `paymentManager.approveToken(spenderAddress, amount, fabTokenAddress)`
3. ⬜ Remove manual ABI definition (lines 152-157)
4. ⬜ Keep allowance pre-check using Phase 1.2's refactored checkAllowance()
5. ⬜ Maintain balance check and error handling

**Line Limit**: Modified function max 50 lines

**Completion Criteria**: All Phase 1.3 tests pass

**Status**: ⬜ Not Started

---

### Phase 2: Model Updates Refactoring

**Target File**: `packages/host-cli/src/commands/update-models.ts`
**Scope**: Replace direct NodeRegistry contract calls with HostManager.updateSupportedModels()

#### Phase 2.1: Write Tests for update-models Command ⬜

**Test File**: `packages/host-cli/tests/commands/update-models.test.ts`

**Test Requirements**:
1. ⬜ Test command uses `HostManager.updateSupportedModels()` instead of direct contract call
2. ⬜ Test command validates and formats model IDs correctly
3. ⬜ Test command loads models from file when --file option provided
4. ⬜ Test command checks host registration status before updating
5. ⬜ Test command waits for 3 confirmations
6. ⬜ Test command verifies update by fetching models after transaction
7. ⬜ Test command requires authenticated SDK

**Expected Test Output**: All 7 tests should FAIL initially

**Line Limit**: Test file max 250 lines

**Status**: ⬜ Not Started

---

#### Phase 2.2: Implement update-models Refactoring ⬜

**File**: `packages/host-cli/src/commands/update-models.ts`
**Lines to Modify**: 1-172 (entire file)

**Implementation Requirements**:
1. ⬜ Remove ABI import and file reading (lines 9-11)
2. ⬜ Replace manual wallet/provider setup with SDK client methods
3. ⬜ Replace `new ethers.Contract()` (lines 87-91) with `sdk.getHostManager()`
4. ⬜ Call `hostManager.updateSupportedModels(formattedModelIds)` (line 131)
5. ⬜ Remove manual contract instantiation, keep model validation logic
6. ⬜ Import `initializeSDK, authenticateSDK, getHostManager` from `../sdk/client`

**Line Limit**: Refactored file max 150 lines (down from 172)

**Completion Criteria**: All Phase 2.1 tests pass

**Status**: ⬜ Not Started

---

### Phase 3: URL Updates Refactoring

**Target File**: `packages/host-cli/src/commands/update-url.ts`
**Scope**: Replace direct NodeRegistry contract calls with HostManager.updateApiUrl()

#### Phase 3.1: Write Tests for update-url Command ⬜

**Test File**: `packages/host-cli/tests/commands/update-url.test.ts`

**Test Requirements**:
1. ⬜ Test command uses `HostManager.updateApiUrl()` instead of direct contract call
2. ⬜ Test command validates URL format before updating
3. ⬜ Test command checks host registration status before updating
4. ⬜ Test command displays current and new URLs
5. ⬜ Test command waits for 3 confirmations
6. ⬜ Test command verifies update by fetching URL after transaction
7. ⬜ Test command requires authenticated SDK

**Expected Test Output**: All 7 tests should FAIL initially

**Line Limit**: Test file max 200 lines

**Status**: ⬜ Not Started

---

#### Phase 3.2: Implement update-url Refactoring ⬜

**File**: `packages/host-cli/src/commands/update-url.ts`
**Lines to Modify**: 1-101 (entire file)

**Implementation Requirements**:
1. ⬜ Remove ABI import and file reading (lines 9-11)
2. ⬜ Replace manual wallet/provider setup with SDK client methods
3. ⬜ Replace `new ethers.Contract()` (lines 52-56) with `sdk.getHostManager()`
4. ⬜ Call `hostManager.updateApiUrl(url)` (line 70)
5. ⬜ Remove manual contract instantiation, keep URL validation logic
6. ⬜ Import `initializeSDK, authenticateSDK, getHostManager` from `../sdk/client`

**Line Limit**: Refactored file max 80 lines (down from 101)

**Completion Criteria**: All Phase 3.1 tests pass

**Status**: ⬜ Not Started

---

### Phase 4: Unregistration Refactoring

**Target File**: `packages/host-cli/src/commands/unregister.ts`
**Scope**: Replace direct NodeRegistry contract calls with HostManager.unregisterHost()

#### Phase 4.1: Write Tests for unregister Command ⬜

**Test File**: `packages/host-cli/tests/commands/unregister.test.ts`

**Test Requirements**:
1. ⬜ Test command uses `HostManager.unregisterHost()` instead of direct contract call
2. ⬜ Test command checks host registration status before unregistering
3. ⬜ Test command displays staked amount before unregistering
4. ⬜ Test command waits for 3 confirmations
5. ⬜ Test command verifies host is inactive after unregistration
6. ⬜ Test command handles "not registered" error gracefully
7. ⬜ Test command requires authenticated SDK

**Expected Test Output**: All 7 tests should FAIL initially

**Line Limit**: Test file max 200 lines

**Status**: ⬜ Not Started

---

#### Phase 4.2: Implement unregister Refactoring ⬜

**File**: `packages/host-cli/src/commands/unregister.ts`
**Lines to Modify**: 1-96 (entire file)

**Implementation Requirements**:
1. ⬜ Remove ABI import and file reading (lines 9-11)
2. ⬜ Replace manual wallet/provider setup with SDK client methods
3. ⬜ Replace `new ethers.Contract()` (lines 44-48) with `sdk.getHostManager()`
4. ⬜ Call `hostManager.unregisterHost()` (line 62)
5. ⬜ Remove manual contract instantiation, keep status checks
6. ⬜ Import `initializeSDK, authenticateSDK, getHostManager` from `../sdk/client`

**Line Limit**: Refactored file max 75 lines (down from 96)

**Completion Criteria**: All Phase 4.1 tests pass

**Status**: ⬜ Not Started

---

### Phase 5: Proof Submission Implementation

**Target File**: `packages/host-cli/src/proof/submitter.ts`
**Scope**: Replace mocked proof submission with real SessionJobManager integration

#### Phase 5.1: Write Tests for Proof Submission ⬜

**Test File**: `packages/host-cli/tests/proof/submitter.test.ts`

**Test Requirements**:
1. ⬜ Test `submitProof()` calls `SessionJobManager.submitProofOfWork()` with correct params
2. ⬜ Test `submitProof()` validates proof data structure
3. ⬜ Test `submitProof()` validates proof hash format (0x + 64 hex chars)
4. ⬜ Test `submitProof()` emits 'proof-submitted' event on success
5. ⬜ Test `submitProof()` emits 'proof-failed' event on failure
6. ⬜ Test `submitProof()` updates statistics on success/failure
7. ⬜ Test `submitProofWithConfirmation()` waits for N confirmations
8. ⬜ Test proof submission requires authenticated SDK

**Expected Test Output**: All 8 tests should FAIL initially (currently mocked)

**Line Limit**: Test file max 300 lines

**Status**: ⬜ Not Started

---

#### Phase 5.2: Implement Real Proof Submission ⬜

**File**: `packages/host-cli/src/proof/submitter.ts`
**Lines to Modify**: 100-174 (submitProof method), 179-230 (submitProofWithConfirmation method)

**Implementation Requirements**:
1. ⬜ Import SessionJobManager from SDK
2. ⬜ Replace mock submission (lines 127-133) with real SDK call
3. ⬜ Get SessionJobManager instance from SDK: `sdk.getSessionManager()`
4. ⬜ Call `sessionManager.submitProof(proofData.jobId, proofData.tokensClaimed, proofData.proof)`
5. ⬜ Handle transaction receipt and extract txHash
6. ⬜ Update statistics tracking to use real gas estimates
7. ⬜ Keep validation logic (lines 101-107) unchanged
8. ⬜ Maintain event emission and error handling

**Line Limit**: Modified methods total max 120 lines

**Completion Criteria**: All Phase 5.1 tests pass

**Status**: ⬜ Not Started

---

## Testing Strategy

### Unit Test Requirements
- All tests must be in `packages/host-cli/tests/` directory
- Use Vitest for testing framework
- Mock SDK methods using `vi.mock()`
- Test both success and error cases
- Verify SDK method calls with correct parameters

### Integration Test Requirements
- Test files in `packages/host-cli/tests/integration/`
- Use real SDK instance with test network
- Verify end-to-end command execution
- Check transaction receipts and on-chain state

### Test Execution
```bash
# Run all Host CLI tests
cd packages/host-cli
pnpm test

# Run specific test file
pnpm test tests/registration/staking-allowance.test.ts

# Run with coverage
pnpm test:coverage
```

---

## Progress Tracking

### Overall Status
- **Phase 1**: 🔄 In Progress (Token Operations - 2/4 sub-phases complete)
- **Phase 2**: ⬜ Not Started (Model Updates)
- **Phase 3**: ⬜ Not Started (URL Updates)
- **Phase 4**: ⬜ Not Started (Unregistration)
- **Phase 5**: ⬜ Not Started (Proof Submission)

### Completion Metrics
- **Tests Written**: 5 / 35 tests (14%)
- **Tests Passing**: 5 / 35 tests (14%)
- **Files Refactored**: 1 / 5 files (partial - checkAllowance only)
- **Lines Reduced**: ~9 / ~200 lines (estimated reduction)

---

## Benefits of Refactoring

1. **Maintainability**: Single source of truth for contract interactions in SDK
2. **Error Handling**: Leverage SDK's built-in retry logic and error wrapping
3. **Multi-Chain Support**: Automatic chain ID handling via SDK
4. **Type Safety**: Use SDK's TypeScript types instead of raw ethers.Contract
5. **Testing**: Easier to mock SDK methods than raw contract calls
6. **Updates**: Automatic benefit from SDK improvements and bug fixes

---

## TDD Bounded Autonomy Rules

1. **Write ALL tests for a sub-phase FIRST**
2. **Show test failures before implementing**
3. **Implement minimally to pass tests**
4. **Strict line limits per file**
5. **No modifications outside specified scope**

---

## Notes

- All phases follow strict TDD: Write tests → See failures → Implement → Tests pass
- No implementation without failing tests first
- Each phase is independent and can be completed separately
- Line limits are enforced to maintain code quality
- SDK methods are already tested in sdk-core, focus on integration testing in CLI

---

## Dependencies

- `@fabstir/sdk-core`: ^1.1.2 (must use latest version with bundled s5js)
- SDK managers required: PaymentManager, HostManager, SessionManager
- All SDK contract ABIs are internal to sdk-core (no external ABI files needed)

---

**Last Updated**: 2025-10-01
**Document Owner**: SDK Team
