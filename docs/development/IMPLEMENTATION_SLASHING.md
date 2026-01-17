# Implementation Plan: Stake Slashing Feature SDK Integration

## Overview

Integrate the newly deployed stake slashing feature from NodeRegistryWithModelsUpgradeable contract into `@fabstir/sdk-core`. This enables the platform owner (and future DAO) to enforce penalties on misbehaving hosts.

## Status: Not Started

**Implementation**: SDK integration for slashing feature (January 2026)
**SDK Version**: Current 1.8.6+ → Target 1.9.0
**Contract Branch**: Deployed to Base Sepolia
**SDK Branch**: `main` (or `feature/slashing-integration`)
**Network**: Base Sepolia (Chain ID: 84532)
**Source Documents**:
- `docs/temp/SLASHING_SPECIFICATION.md`
- `docs/temp/PLATFORMLESS_AI_WHITEPAPER.md` (Section 6: Dispute Resolution)

### Completed:
- [x] Contract deployed with slashing feature
- [x] ABI updated in `docs/compute-contracts-reference/client-abis/`

### In Progress:
- [ ] Phase 1: Type Definitions and Errors

### Pending:
- [ ] Phase 2: HostManager Methods
- [ ] Phase 3: Event Listeners
- [ ] Phase 4: Integration Testing
- [ ] Phase 5: Test Harness UI Integration
- [ ] Phase 6: Build and Package

---

## Summary of Contract Changes

| Change | Type | SDK Impact |
|--------|------|------------|
| `slashStake(host, amount, evidenceCID, reason)` | **NEW** | Add execution method |
| `lastSlashTime(host)` | **NEW** | Add query method |
| `initializeSlashing(treasury)` | **NEW** | Add admin method |
| `setSlashingAuthority(newAuthority)` | **NEW** | Add admin method |
| `setTreasury(newTreasury)` | **NEW** | Add admin method |
| `slashingAuthority()` | **NEW** | Add query method |
| `treasury()` | **NEW** | Add query method |
| `SlashExecuted` event | **NEW** | Add event listener |
| `HostAutoUnregistered` event | **NEW** | Add event listener |
| `SlashingAuthorityUpdated` event | **NEW** | Add event listener |
| `TreasuryUpdated` event | **NEW** | Add event listener |

---

## Architecture: Slashing Flow

```
User/Client                      Owner/Authority                Smart Contract (NodeRegistry)
    ↓                                  ↓                              ↓
Submit dispute evidence       Review dispute CID              [Has slashing functions]
(proofCID, deltaCID)                 ↓
    ↓                         Verify misbehavior
Store on S5 →                       ↓
    ↓                         Calculate penalty
Generate evidenceCID                ↓                                ↓
    ↓                         slashStake(                     Verify:
Report to owner ──────────→     host,                         ├─ caller == slashingAuthority
                               amount,          ──────────────→├─ amount <= 50% of stake
                               evidenceCID,                    ├─ lastSlashTime + 24h < now
                               reason                          └─ host has sufficient stake
                             )                                       ↓
                                  ↓                           Execute slash:
                             Receipt ←────────────────────────├─ Transfer to treasury
                                                              ├─ Update stake balance
                                                              └─ Emit SlashExecuted event
                                                                     ↓
                                                              If stake < 100 FAB:
                                                              ├─ Auto-unregister host
                                                              └─ Emit HostAutoUnregistered
```

### Key Contract Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SLASH_PERCENTAGE` | 50 | Max % of stake slashable per action |
| `SLASH_COOLDOWN` | 86400 | 24 hours between slashes on same host |
| `MIN_STAKE_AFTER_SLASH` | 100 FAB | Auto-unregister threshold |

### Error Messages to Handle

| Error Message | Cause | SDK Action |
|--------------|-------|------------|
| `"Not slashing authority"` | Caller not authorized | Check authority before call |
| `"Slash cooldown active"` | < 24h since last slash | Check cooldown before call |
| `"Amount exceeds maximum"` | > 50% of current stake | Validate amount client-side |
| `"Insufficient stake"` | Host stake too low | Check stake before call |
| `"Host not registered"` | Host doesn't exist | Validate host first |

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Type Definitions and Error Classes

### Sub-phase 1.1: Create Slashing Type Definitions

**Goal**: Define TypeScript interfaces for slashing operations.

**Line Budget**: 50 lines

#### Tasks
- [ ] Write test: `SlashEvent` interface has all required fields
- [ ] Write test: `HostAutoUnregisteredEvent` interface has all required fields
- [ ] Write test: `HostSlashingStatus` interface has all required fields
- [ ] Write test: `SlashingConfig` interface has all required fields
- [ ] Create `packages/sdk-core/src/types/slashing.types.ts`
- [ ] Add `SlashEvent` interface (host, amount, remainingStake, evidenceCID, reason, executor, timestamp, transactionHash)
- [ ] Add `HostAutoUnregisteredEvent` interface (host, slashedAmount, returnedAmount, reason, transactionHash)
- [ ] Add `HostSlashingStatus` interface (lastSlashTime, timeSinceLastSlash, canBeSlashed, timeUntilNextSlash)
- [ ] Add `SlashingConfig` interface (slashingAuthority, treasury, maxSlashPercentage, minStakeAfterSlash, slashCooldown)
- [ ] Export types from `types/index.ts`

**Test Files:**
- `packages/sdk-core/tests/unit/slashing-types.test.ts` (NEW, ~60 lines)

**Implementation Files:**
- `packages/sdk-core/src/types/slashing.types.ts` (NEW, ~50 lines)
- `packages/sdk-core/src/types/index.ts` (MODIFY, +1 export)

**Success Criteria:**
- [ ] All type interfaces defined with correct field types
- [ ] `SlashEvent.amount` is `bigint`
- [ ] `SlashEvent.timestamp` is `bigint`
- [ ] Types exported from SDK package
- [ ] All 4 tests pass

**Test Results:** ⏳ Pending

---

### Sub-phase 1.2: Add Slashing Error Classes

**Goal**: Create error classes for slashing-specific errors.

**Line Budget**: 40 lines

#### Tasks
- [ ] Write test: `SlashingError` extends Error with code property
- [ ] Write test: `SlashingAuthorityError` has code 'NOT_SLASHING_AUTHORITY'
- [ ] Write test: `SlashCooldownError` has code 'SLASH_COOLDOWN_ACTIVE'
- [ ] Write test: `InvalidSlashAmountError` has code 'INVALID_SLASH_AMOUNT'
- [ ] Write test: `InsufficientStakeError` has code 'INSUFFICIENT_STAKE'
- [ ] Add `SlashingError` base class to `packages/sdk-core/src/errors/model-errors.ts`
- [ ] Add `SlashingAuthorityError` class
- [ ] Add `SlashCooldownError` class
- [ ] Add `InvalidSlashAmountError` class
- [ ] Add `InsufficientStakeError` class
- [ ] Export errors from `errors/index.ts`

**Test Files:**
- `packages/sdk-core/tests/unit/slashing-errors.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/errors/model-errors.ts` (MODIFY, +35 lines)
- `packages/sdk-core/src/errors/index.ts` (MODIFY, +5 exports)

**Success Criteria:**
- [ ] All error classes extend correct base class
- [ ] Each error has unique code property
- [ ] Errors exported from SDK package
- [ ] All 5 tests pass

**Test Results:** ⏳ Pending

---

## Phase 2: HostManager Slashing Methods

### Sub-phase 2.1: Add Query Methods

**Goal**: Add read-only methods to query slashing state.

**Line Budget**: 80 lines

#### Tasks
- [ ] Write test: `getLastSlashTime()` returns number (0 for never slashed)
- [ ] Write test: `getSlashingStatus()` returns correct `HostSlashingStatus` shape
- [ ] Write test: `getSlashingStatus()` calculates `canBeSlashed` correctly
- [ ] Write test: `getSlashingStatus()` calculates `timeUntilNextSlash` correctly
- [ ] Write test: `getSlashingAuthority()` returns address string
- [ ] Write test: `getTreasury()` returns address string
- [ ] Add `getLastSlashTime(hostAddress: string): Promise<number>` method
- [ ] Add `getSlashingStatus(hostAddress: string): Promise<HostSlashingStatus>` method
- [ ] Add `getSlashingAuthority(): Promise<string>` method
- [ ] Add `getTreasury(): Promise<string>` method
- [ ] Add JSDoc comments for all methods

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-slashing.test.ts` (NEW, ~100 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (MODIFY, +70 lines)

**Success Criteria:**
- [ ] All query methods use `view` contract calls (no gas)
- [ ] `getSlashingStatus()` correctly computes derived fields
- [ ] Error handling for uninitialized slashing
- [ ] All 6 tests pass

**Test Results:** ⏳ Pending

---

### Sub-phase 2.2: Add Admin Methods

**Goal**: Add methods for slashing system administration.

**Line Budget**: 70 lines

#### Tasks
- [ ] Write test: `initializeSlashing()` calls contract with treasury address
- [ ] Write test: `initializeSlashing()` waits for 3 confirmations
- [ ] Write test: `setSlashingAuthority()` calls contract with new authority
- [ ] Write test: `setSlashingAuthority()` throws `SlashingAuthorityError` if not owner
- [ ] Write test: `setTreasury()` calls contract with new treasury address
- [ ] Add `initializeSlashing(treasuryAddress: string): Promise<string>` method
- [ ] Add `setSlashingAuthority(newAuthority: string): Promise<string>` method
- [ ] Add `setTreasury(newTreasury: string): Promise<string>` method
- [ ] All methods wait for `tx.wait(3)` confirmations
- [ ] Gas limit: 150000n for admin methods

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-slashing.test.ts` (EXTEND, +80 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (EXTEND, +60 lines)

**Success Criteria:**
- [ ] Admin methods return transaction hash on success
- [ ] Methods validate caller is owner/authority
- [ ] All 5 tests pass

**Test Results:** ⏳ Pending

---

### Sub-phase 2.3: Add Slash Execution Method

**Goal**: Add the main method to execute stake slashing.

**Line Budget**: 100 lines

#### Tasks
- [ ] Write test: `slashHostStake()` calls contract with all 4 parameters
- [ ] Write test: `slashHostStake()` validates amount <= 50% of host stake
- [ ] Write test: `slashHostStake()` validates evidenceCID is non-empty
- [ ] Write test: `slashHostStake()` validates reason is non-empty
- [ ] Write test: `slashHostStake()` throws `SlashingAuthorityError` if not authority
- [ ] Write test: `slashHostStake()` throws `SlashCooldownError` if cooldown active
- [ ] Write test: `slashHostStake()` throws `InvalidSlashAmountError` if amount too high
- [ ] Write test: `slashHostStake()` throws `InsufficientStakeError` if stake too low
- [ ] Write test: `slashHostStake()` waits for 3 confirmations
- [ ] Write test: `slashHostStake()` returns `SlashEvent` on success
- [ ] Add `slashHostStake(hostAddress: string, amount: string, evidenceCID: string, reason: string): Promise<SlashEvent>` method
- [ ] Parse amount to bigint with `parseUnits(amount, 18)` for FAB token
- [ ] Add client-side validations before contract call
- [ ] Extract event data from receipt
- [ ] Gas limit: 250000n for slash execution

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-slashing.test.ts` (EXTEND, +150 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (EXTEND, +90 lines)

**Success Criteria:**
- [ ] Amount parsed correctly as 18-decimal FAB token
- [ ] Client-side validation prevents obvious errors
- [ ] Contract errors mapped to SDK error classes
- [ ] Event data extracted from receipt
- [ ] All 10 tests pass

**Test Results:** ⏳ Pending

---

## Phase 3: Event Listeners

### Sub-phase 3.1: Add SlashExecuted Event Listener

**Goal**: Add ability to subscribe to slash events.

**Line Budget**: 50 lines

#### Tasks
- [ ] Write test: `onSlashExecuted()` registers event listener
- [ ] Write test: `onSlashExecuted()` callback receives `SlashEvent` shape
- [ ] Write test: `onSlashExecuted()` filter by host address works
- [ ] Write test: `onSlashExecuted()` returns unsubscribe function
- [ ] Write test: Unsubscribe function removes listener
- [ ] Add `onSlashExecuted(callback: (event: SlashEvent) => void, filter?: { host?: string }): () => void`
- [ ] Use `nodeRegistry.filters.SlashExecuted()` for filtering
- [ ] Map event args to `SlashEvent` interface
- [ ] Return cleanup function

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-events.test.ts` (NEW, ~80 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (EXTEND, +45 lines)

**Success Criteria:**
- [ ] Listener receives properly typed events
- [ ] Optional host filter works correctly
- [ ] Cleanup function removes listener
- [ ] All 5 tests pass

**Test Results:** ⏳ Pending

---

### Sub-phase 3.2: Add HostAutoUnregistered Event Listener

**Goal**: Add ability to subscribe to auto-unregister events.

**Line Budget**: 40 lines

#### Tasks
- [ ] Write test: `onHostAutoUnregistered()` registers event listener
- [ ] Write test: `onHostAutoUnregistered()` callback receives correct shape
- [ ] Write test: `onHostAutoUnregistered()` returns unsubscribe function
- [ ] Add `onHostAutoUnregistered(callback: (event: HostAutoUnregisteredEvent) => void): () => void`
- [ ] Map event args to `HostAutoUnregisteredEvent` interface

**Test Files:**
- `packages/sdk-core/tests/unit/host-manager-events.test.ts` (EXTEND, +50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/HostManager.ts` (EXTEND, +35 lines)

**Success Criteria:**
- [ ] Listener receives properly typed events
- [ ] Cleanup function removes listener
- [ ] All 3 tests pass

**Test Results:** ⏳ Pending

---

## Phase 4: Integration Testing

### Sub-phase 4.1: Unit Test Suite Verification

**Goal**: Ensure all unit tests pass.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [ ] Run `cd packages/sdk-core && pnpm build`
- [ ] Verify build succeeds without errors
- [ ] Run `cd packages/sdk-core && pnpm test`
- [ ] Verify all slashing-related unit tests pass
- [ ] Check for TypeScript errors in modified files

**Success Criteria:**
- [ ] Build completes successfully
- [ ] All new tests pass
- [ ] No TypeScript errors in modified files

**Test Results:** ⏳ Pending

---

### Sub-phase 4.2: Contract Integration Test

**Goal**: Test slashing methods against live Base Sepolia contracts.

**Line Budget**: 150 lines (new test file)

#### Tasks
- [ ] Write test: `getSlashingAuthority()` returns owner address
- [ ] Write test: `getTreasury()` returns treasury address from `.env.test`
- [ ] Write test: `getLastSlashTime(TEST_HOST_1_ADDRESS)` returns 0 (never slashed)
- [ ] Write test: `getSlashingStatus()` returns `canBeSlashed: true` for active host
- [ ] Write test: `slashHostStake()` with non-authority fails with correct error
- [ ] Write test: (if owner) `slashHostStake()` succeeds and emits event
- [ ] Create `packages/sdk-core/tests/integration/slashing.test.ts`
- [ ] Use environment variables from `.env.test`
- [ ] Skip destructive tests unless `ENABLE_SLASH_TESTS=true`

**Test Files:**
- `packages/sdk-core/tests/integration/slashing.test.ts` (NEW, ~150 lines)

**Implementation Files:**
- None (test only)

**Success Criteria:**
- [ ] Query methods return expected values
- [ ] Error handling works correctly
- [ ] All 6 integration tests pass

**Test Results:** ⏳ Pending

---

## Phase 5: Test Harness UI Integration

### Sub-phase 5.1: Add Slashing Authority Detection

**Goal**: Detect if connected wallet is the slashing authority and show/hide slashing UI accordingly.

**Line Budget**: 50 lines

#### Tasks
- [ ] Add `isSlashingAuthority` state variable
- [ ] Add `slashingAuthority` state variable (stores authority address)
- [ ] Call `hostManager.getSlashingAuthority()` on SDK load
- [ ] Compare connected wallet to slashing authority address
- [ ] Update authority check when wallet changes
- [ ] Add loading state for authority check

**Implementation Files:**
- `apps/harness/components/NodeManagementClient.tsx` (MODIFY, +40 lines)

**Success Criteria:**
- [ ] `isSlashingAuthority` correctly set based on connected wallet
- [ ] Authority check updates when wallet changes
- [ ] Authority address displayed in UI for transparency

**Test Results:** ⏳ Pending (manual testing)

---

### Sub-phase 5.2: Add Slashing Panel UI

**Goal**: Add UI panel for slashing operations, only visible to slashing authority.

**Line Budget**: 150 lines

#### Tasks
- [ ] Add conditional render: show panel only if `isSlashingAuthority === true`
- [ ] Add host address input field (pre-fill from selected host in list)
- [ ] Add slash amount input field (FAB units)
- [ ] Add evidence CID input field (paste S5 CID)
- [ ] Add reason input field (text description)
- [ ] Add "Calculate Max Slash" helper (shows 50% of host stake)
- [ ] Add "Execute Slash" button with confirmation dialog
- [ ] Display cooldown warning if host was recently slashed
- [ ] Display current host stake for reference

**Implementation Files:**
- `apps/harness/components/NodeManagementClient.tsx` (EXTEND, +140 lines)

**Success Criteria:**
- [ ] Panel hidden for non-authority wallets
- [ ] All input fields validate before submission
- [ ] Confirmation dialog prevents accidental slashes
- [ ] Max slash calculation shows correct value

**Test Results:** ⏳ Pending (manual testing)

---

### Sub-phase 5.3: Implement Slash Execution Handler

**Goal**: Wire up slash execution to SDK method.

**Line Budget**: 80 lines

#### Tasks
- [ ] Add `slashHost()` handler function
- [ ] Validate all inputs before calling SDK
- [ ] Call `hostManager.slashHostStake(host, amount, evidenceCID, reason)`
- [ ] Show loading state during transaction
- [ ] Display success message with transaction hash
- [ ] Display error message with specific error type
- [ ] Refresh host list after successful slash
- [ ] Log all slash operations to log panel

**Implementation Files:**
- `apps/harness/components/NodeManagementClient.tsx` (EXTEND, +70 lines)

**Success Criteria:**
- [ ] Slash executes successfully when authority connected
- [ ] Error messages shown for each error type
- [ ] Host list updates after slash
- [ ] Transaction hash displayed and linkable to explorer

**Test Results:** ⏳ Pending (manual testing)

---

### Sub-phase 5.4: Add Slashing Status Display

**Goal**: Show slashing-related info for each host in the discovered nodes list.

**Line Budget**: 60 lines

#### Tasks
- [ ] Add `lastSlashTime` to host info display
- [ ] Add `canBeSlashed` indicator (✅/❌)
- [ ] Add `timeUntilNextSlash` countdown if in cooldown
- [ ] Add "Select for Slash" button next to each host (authority only)
- [ ] Clicking button pre-fills host address in slash panel

**Implementation Files:**
- `apps/harness/components/NodeManagementClient.tsx` (EXTEND, +55 lines)

**Success Criteria:**
- [ ] Slashing status visible for all hosts
- [ ] Cooldown countdown accurate
- [ ] "Select for Slash" button works correctly

**Test Results:** ⏳ Pending (manual testing)

---

## Phase 6: Build and Package

### Sub-phase 6.1: Final Build and Verification

**Goal**: Create final SDK build with version increment.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [ ] Update `packages/sdk-core/package.json` version to 1.9.0
- [ ] Run `cd packages/sdk-core && pnpm build:esm && pnpm build:cjs`
- [ ] Run `cd packages/sdk-core && pnpm test`
- [ ] Run `cd packages/sdk-core && pnpm pack`
- [ ] Verify tarball created
- [ ] Copy tarball to workspace root

**Success Criteria:**
- [ ] SDK version incremented to 1.9.0
- [ ] Build succeeds
- [ ] All tests pass
- [ ] Tarball `fabstir-sdk-core-1.9.0.tgz` created

**Test Results:** ⏳ Pending

---

### Sub-phase 6.2: Test Harness Verification

**Goal**: Verify test harness works with new SDK.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [ ] Rebuild SDK and clear Next.js cache
- [ ] Start test harness: `cd apps/harness && pnpm dev`
- [ ] Connect with non-authority wallet - verify slashing panel hidden
- [ ] Connect with authority wallet - verify slashing panel visible
- [ ] Execute test slash on testnet (if safe to do so)
- [ ] Verify host status updates after slash

**Success Criteria:**
- [ ] Slashing panel visibility correct based on wallet
- [ ] All slashing operations work end-to-end
- [ ] No console errors in browser

**Test Results:** ⏳ Pending

---

## Files Changed Summary

| File | Phase | Action | Lines |
|------|-------|--------|-------|
| `packages/sdk-core/src/types/slashing.types.ts` | 1.1 | New | +50 |
| `packages/sdk-core/src/types/index.ts` | 1.1 | Modify | +1 |
| `packages/sdk-core/src/errors/model-errors.ts` | 1.2 | Modify | +35 |
| `packages/sdk-core/src/errors/index.ts` | 1.2 | Modify | +5 |
| `packages/sdk-core/src/managers/HostManager.ts` | 2.1-3.2 | Modify | +300 |
| `apps/harness/components/NodeManagementClient.tsx` | 5.1-5.4 | Modify | +305 |
| **Total New Code** | | | **~695** |

---

## Test Coverage Target

| Test File | Tests | Status |
|-----------|-------|--------|
| `slashing-types.test.ts` | 4 | ⏳ Pending |
| `slashing-errors.test.ts` | 5 | ⏳ Pending |
| `host-manager-slashing.test.ts` | 21 | ⏳ Pending |
| `host-manager-events.test.ts` | 8 | ⏳ Pending |
| `slashing.test.ts` (integration) | 6 | ⏳ Pending |
| Test Harness (manual) | 6 | ⏳ Pending |
| **Total** | **50** | ⏳ **0/50** |

---

## Contract Details

**Proxy Address (Unchanged):**
```
CONTRACT_NODE_REGISTRY=0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22
```

**New Implementation:**
```
0xF2D98D38B2dF95f4e8e4A49750823C415E795377
```

**ABI Location:**
```
docs/compute-contracts-reference/client-abis/NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json
```

**Note:** HostManager already imports this ABI at line 29, so new functions are automatically available.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Slashing wrong host | Require non-empty evidenceCID and reason |
| Amount calculation error | Use `parseUnits(amount, 18)` for FAB decimals |
| Cooldown bypass | Check cooldown client-side before call |
| Treasury not set | Verify treasury address before slash execution |
| Event listener memory leak | Return unsubscribe function; document cleanup |

---

## Not In Scope (Future Work)

- DAO governance integration
- Multi-sig slashing authority
- Automatic slash based on dispute resolution
- Historical slash event indexing (beyond current session)
- Slash appeals process
- Production UI (this is test harness only)
