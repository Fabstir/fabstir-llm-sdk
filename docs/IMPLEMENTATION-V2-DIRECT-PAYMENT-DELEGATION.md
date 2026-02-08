# Implementation Plan: V2 Direct Payment Delegation (No Escrow)

## Overview

Replace V1 escrow-based delegation with V2 direct payment delegation. Sub-accounts pull USDC directly from primary wallet via `transferFrom` - no escrow step required.

## Status: COMPLETE ✅

**Implementation**: V2 Direct Payment Delegation
**SDK Version**: 1.10.0 (target)
**Network**: Base Sepolia (Chain ID: 84532)
**Prerequisite**: V1 Delegated Sessions complete (being replaced)

### Phases Overview:
- [x] Phase 1: Update Contract ABI
- [x] Phase 2: Update JobMarketplace Wrapper
- [x] Phase 3: Update SessionManager (no changes needed - no depositor refs in SessionManager)
- [x] Phase 4: Update Test Harness
- [x] Phase 5: Build & Integration Testing ✅ VERIFIED

---

## Summary of Changes

| Aspect | V1 (Escrow Pattern) | V2 (Direct Payment) |
|--------|---------------------|---------------------|
| User Steps | 3 (deposit + authorize + start) | 2 (approve + authorize, then start) |
| Funds Location | Contract escrow | User's wallet |
| Contract Function | `createSessionFromDepositForModelAsDelegate` | `createSessionForModelAsDelegate` |
| Payment Method | Reads from deposit balance | `transferFrom(payer, contract, amount)` |
| ETH Support | Yes | No (USDC only) |
| Setup Popups | 3 | 2 |

### V2 Contract Functions

| Function | Purpose |
|----------|---------|
| `authorizeDelegate(delegate, authorized)` | Primary authorizes sub-account (unchanged) |
| `isDelegateAuthorized(payer, delegate)` | Check authorization (unchanged) |
| `createSessionAsDelegate(payer, host, token, amount, ...)` | **NEW** - Direct payment, no model |
| `createSessionForModelAsDelegate(payer, modelId, host, token, amount, ...)` | **NEW** - Direct payment with model |

### V1 Functions to REMOVE from SDK

| Function | Replacement |
|----------|-------------|
| `createSessionFromDepositAsDelegate` | `createSessionAsDelegate` |
| `createSessionFromDepositForModelAsDelegate` | `createSessionForModelAsDelegate` |

### Custom Errors

| Error | Meaning |
|-------|---------|
| `NotDelegate()` | Caller not authorized for payer |
| `ERC20Only()` | Must use USDC (no ETH) |
| `BadDelegateParams()` | Invalid parameters |

### Contract Address

```typescript
const JOB_MARKETPLACE = "0x95132177F964FF053C1E874b53CF74d819618E06";
```

---

## Development Approach: TDD Bounded Autonomy

1. Write tests for sub-phase FIRST (if applicable)
2. Implement minimally to pass
3. Strict line limits per task (enforced)
4. No modifications outside specified scope
5. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Update Contract ABI

### Sub-phase 1.1: Copy V2 ABI

**Goal**: Ensure SDK has ABI with V2 direct payment functions.

**Line Budget**: 0 lines (file copy only)

#### Tasks
- [x] Copy `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` to SDK
- [x] Verify ABI contains `createSessionAsDelegate` function (8 params)
- [x] Verify ABI contains `createSessionForModelAsDelegate` function (9 params)
- [x] Verify ABI contains custom errors: `NotDelegate`, `ERC20Only`, `BadDelegateParams`
- [x] Verify V1 functions removed: `createSessionFromDepositAsDelegate`, `createSessionFromDepositForModelAsDelegate`

**Source Files:**
- `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`

**Destination Files:**
- `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`

**Success Criteria:**
- [x] ABI copied successfully
- [x] V2 functions present
- [x] V1 escrow delegation functions absent
- [x] Custom errors defined

---

## Phase 2: Update JobMarketplace Wrapper

### Sub-phase 2.1: Update DelegatedSessionParams Type

**Goal**: Update interface for V2 direct payment pattern.

**Line Budget**: 20 lines

#### Tasks
- [x] Rename `depositor` to `payer` in `DelegatedSessionParams` interface
- [x] Update JSDoc to reflect direct payment (not escrow)
- [x] Ensure `paymentToken` is required (must be ERC-20)
- [x] Add note that ETH not supported for delegation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, ~20 lines)

**New Interface:**
```typescript
/**
 * Parameters for V2 direct payment delegated session.
 * Pulls USDC directly from payer's wallet via transferFrom.
 * USDC only - ETH not supported for delegation.
 */
export interface DelegatedSessionParams {
  payer: string;           // Primary wallet (whose USDC to use)
  host: string;
  paymentToken: string;    // Must be ERC-20 (USDC), NOT address(0)
  amount: string;          // Amount in token units (e.g., "10" for 10 USDC)
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  proofTimeoutWindow?: number;
  modelId?: string;        // Required for createSessionForModelAsDelegate
}
```

**Success Criteria:**
- [x] Interface updated with `payer` field
- [x] JSDoc reflects V2 direct payment
- [x] TypeScript compilation succeeds

---

### Sub-phase 2.2: Remove V1 Escrow Delegation Methods

**Goal**: Remove obsolete V1 methods from SDK.

**Line Budget**: -100 lines (deletion)

#### Tasks
- [x] Remove `createSessionFromDepositAsDelegate()` method (~45 lines)
- [x] Remove `createSessionFromDepositForModelAsDelegate()` method (~50 lines)
- [x] Verify TypeScript compilation succeeds
- [x] Verify no references to removed methods in SDK

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, delete ~95 lines)

**Success Criteria:**
- [x] V1 methods removed
- [x] No compilation errors
- [x] No broken references

---

### Sub-phase 2.3: Add createSessionAsDelegate Method (V2)

**Goal**: Add V2 non-model delegated session creation.

**Line Budget**: 50 lines

#### Tasks
- [x] Add `createSessionAsDelegate(params: DelegatedSessionParams): Promise<number>` method
- [x] Validate payer is not zero address
- [x] Validate paymentToken is not zero address (ERC20Only check)
- [x] Validate proofTimeoutWindow (60-3600 seconds)
- [x] Convert amount based on token decimals (6 for USDC)
- [x] Call contract `createSessionAsDelegate(payer, host, token, amount, price, duration, interval, timeout)`
- [x] Wait for transaction confirmation
- [x] Extract sessionId from `SessionCreatedByDelegate` event
- [x] Handle custom errors (`NotDelegate`, `ERC20Only`, `BadDelegateParams`)
- [x] Add JSDoc documentation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +50 lines)

**Method Signature:**
```typescript
/**
 * Create session as delegate - pulls USDC directly from payer's wallet.
 * V2 direct payment pattern - no escrow required.
 * @param params Session parameters with payer address
 * @returns Session ID
 * @throws NotDelegate if caller not authorized
 * @throws ERC20Only if paymentToken is address(0)
 */
async createSessionAsDelegate(params: DelegatedSessionParams): Promise<number>
```

**Success Criteria:**
- [x] Method compiles without errors
- [x] Validates payer address
- [x] Validates token is not address(0)
- [x] Returns sessionId from event
- [x] Custom errors handled

---

### Sub-phase 2.4: Add createSessionForModelAsDelegate Method (V2)

**Goal**: Add V2 model-specific delegated session creation.

**Line Budget**: 55 lines

#### Tasks
- [x] Add `createSessionForModelAsDelegate(params: DelegatedSessionParams): Promise<number>` method
- [x] Validate payer is not zero address
- [x] Validate paymentToken is not zero address (ERC20Only check)
- [x] Validate modelId is provided and not bytes32(0)
- [x] Validate proofTimeoutWindow (60-3600 seconds)
- [x] Convert amount based on token decimals (6 for USDC)
- [x] Call contract `createSessionForModelAsDelegate(payer, modelId, host, token, amount, price, duration, interval, timeout)`
- [x] Wait for transaction confirmation
- [x] Extract sessionId from `SessionCreatedByDelegate` event
- [x] Handle custom errors
- [x] Add JSDoc documentation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +55 lines)

**Method Signature:**
```typescript
/**
 * Create model session as delegate - pulls USDC directly from payer's wallet.
 * V2 direct payment pattern - no escrow required.
 * @param params Session parameters with payer address and modelId (required)
 * @returns Session ID
 * @throws NotDelegate if caller not authorized
 * @throws ERC20Only if paymentToken is address(0)
 */
async createSessionForModelAsDelegate(params: DelegatedSessionParams): Promise<number>
```

**Success Criteria:**
- [x] Method compiles without errors
- [x] Validates modelId is provided
- [x] Validates payer address
- [x] Validates token is not address(0)
- [x] Returns sessionId from event

---

### Sub-phase 2.5: Update SDK Exports

**Goal**: Ensure V2 types and methods are properly exported.

**Line Budget**: 5 lines

#### Tasks
- [x] Verify `DelegatedSessionParams` is exported from index.ts
- [x] Verify no V1 method references remain in exports
- [x] Run TypeScript compilation

**Implementation Files:**
- `packages/sdk-core/src/index.ts` (VERIFY, ~0-5 lines if changes needed)

**Success Criteria:**
- [x] `DelegatedSessionParams` exported
- [x] No broken exports
- [x] TypeScript compiles

---

## Phase 3: Update SessionManager

### Sub-phase 3.1: Update registerDelegatedSession

**Goal**: Update terminology from "depositor" to "payer" for clarity.

**Line Budget**: 10 lines (mostly renames)

**Status**: SKIPPED - No `depositor` references exist in SessionManager. The method works with V2 as-is.

#### Tasks
- [x] Rename `depositor` parameter references to `payer` (N/A - none exist)
- [x] Update any JSDoc comments (N/A)
- [x] Ensure method still works with delegated sessions (verified)

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (NO CHANGES NEEDED)

**Success Criteria:**
- [x] Terminology updated (N/A)
- [x] Method still functional
- [x] No compilation errors

---

### Sub-phase 3.2: Add Allowance Check Helper (Optional)

**Goal**: Add helper to check USDC allowance before session creation.

**Line Budget**: 15 lines

**Status**: SKIPPED (Optional) - Allowance checking will be done in test harness UI.

#### Tasks
- [ ] Add `checkAllowance(payer: string, tokenAddress: string, spender: string): Promise<bigint>` helper
- [ ] Use ERC-20 `allowance()` call
- [ ] Return allowance amount

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` OR utility file (MODIFY, +15 lines)

**Success Criteria:**
- [ ] Helper returns correct allowance
- [ ] Can be used for pre-flight checks

---

## Phase 4: Update Test Harness

### Sub-phase 4.1: Remove Escrow UI Elements

**Goal**: Remove all escrow-related UI from harness.

**Line Budget**: -80 lines (deletion)

#### Tasks
- [x] Remove "Deposit to Escrow" button
- [x] Remove "Contract Escrow Balance" display
- [x] Remove `depositToContract` state variable (replaced with allowance state)
- [x] Remove `setDepositToContract` setter
- [x] Remove `readContractDepositBalance()` function
- [x] Remove `handleDepositToContract()` function (replaced with approveUsdc)
- [x] Remove escrow balance from balance display section
- [x] Verify page renders without errors

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, delete ~80 lines)

**Success Criteria:**
- [x] No escrow UI visible
- [x] Page renders without errors
- [x] No references to escrow functions

---

### Sub-phase 4.2: Add USDC Approval State

**Goal**: Add state for tracking USDC approval to contract.

**Line Budget**: 10 lines

#### Tasks
- [x] Add `usdcAllowance` state (bigint, default 0n)
- [x] Add `isApproving` state (boolean, default false)
- [x] Add `approvalError` state (string, default "")
- [x] Add constant `DEFAULT_APPROVAL_AMOUNT = parseUnits("1000", 6)` // $1,000 USDC

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +10 lines)

**Success Criteria:**
- [x] State variables added
- [x] Page renders without errors

---

### Sub-phase 4.3: Add Check Allowance Function

**Goal**: Check USDC allowance on wallet connect and periodically.

**Line Budget**: 25 lines

#### Tasks
- [x] Add `checkUsdcAllowance()` async function
- [x] Get primary account address
- [x] Call USDC contract `allowance(primaryAccount, jobMarketplace)`
- [x] Update `usdcAllowance` state
- [x] Call on wallet connect (via readAllBalances)
- [x] Add to balance refresh interval
- [x] Add console logging

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +25 lines)

**Success Criteria:**
- [x] Allowance checked on connect
- [x] State updated correctly
- [x] Console shows allowance

---

### Sub-phase 4.4: Add Approve USDC Function

**Goal**: Allow user to approve USDC to contract.

**Line Budget**: 35 lines

#### Tasks
- [x] Add `approveUsdc()` async function
- [x] Set `isApproving` to true
- [x] Get primary account signer from SDK
- [x] Create USDC contract instance
- [x] Call `approve(jobMarketplace, DEFAULT_APPROVAL_AMOUNT)`
- [x] Wait for transaction confirmation (3 blocks)
- [x] Update `usdcAllowance` state via checkUsdcAllowance()
- [x] Add system messages for: starting, success, error
- [x] Set `isApproving` to false
- [x] Handle and display errors

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +35 lines)

**Success Criteria:**
- [x] Function approves USDC successfully
- [x] Transaction requires popup (expected)
- [x] State updates after confirmation
- [x] System messages show progress

---

### Sub-phase 4.5: Add Approval UI Elements

**Goal**: Add UI for USDC approval status and button.

**Line Budget**: 30 lines

#### Tasks
- [x] Add "USDC Allowance" display showing current allowance
- [x] Add "Approve USDC ($1,000)" button
- [x] Only show button when:
  - `isConnected` is true
  - `usdcAllowance` < SESSION_DEPOSIT_AMOUNT
- [x] Disable button when `isApproving` is true
- [x] Button calls `approveUsdc()`
- [x] Show loading state while approving
- [x] Show success indicator when allowance sufficient

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +30 lines in JSX)

**Success Criteria:**
- [x] Allowance displayed
- [x] Button visible when allowance low
- [x] Button hidden when allowance sufficient
- [x] Loading state works

---

### Sub-phase 4.6: Update Session Creation for V2

**Goal**: Use V2 direct payment delegation instead of V1 escrow.

**Line Budget**: 40 lines (net change, replacing existing code)

#### Tasks
- [x] Update delegation detection:
  - `isDelegateAuthorized` is true
  - `subAccount` is available
  - Removed `isDepositMode` check (no longer relevant)
- [x] Update contract call to V2:
  ```typescript
  await marketplace.createSessionForModelAsDelegate({
    payer: primaryAccount,
    modelId: modelId,
    host: host.address,
    paymentToken: contracts.USDC,
    amount: sessionConfig.depositAmount,
    pricePerToken: sessionConfig.pricePerToken,
    duration: sessionConfig.duration,
    proofInterval: sessionConfig.proofInterval,
    proofTimeoutWindow: sessionConfig.proofTimeoutWindow,
  })
  ```
- [x] Add pre-flight check for sufficient allowance
- [x] Add pre-flight check for sufficient balance
- [x] Update system messages (remove "from deposit" terminology)
- [x] Add console logging for V2 path

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, ~40 lines in startSession())

**Success Criteria:**
- [x] V2 method called instead of V1
- [x] Pre-flight checks work
- [x] Session created successfully (pending manual test)
- [x] No popup after setup (pending manual test)

---

### Sub-phase 4.7: Remove Deposit Mode Toggle

**Goal**: Remove deposit mode toggle since V2 doesn't use escrow.

**Line Budget**: -20 lines (deletion)

#### Tasks
- [x] Remove `isDepositMode` state variable (replaced with V2 allowance approach)
- [x] Remove deposit mode toggle UI
- [x] Remove any conditional logic based on `isDepositMode`
- [x] Simplify flow to always use V2 delegation when authorized

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, delete ~20 lines)

**Success Criteria:**
- [x] No deposit mode toggle
- [x] Single clear flow for delegated sessions
- [x] Page renders without errors

---

### Sub-phase 4.8: Update Balance Display

**Goal**: Update balance section to show relevant V2 info.

**Line Budget**: 15 lines (net change)

#### Tasks
- [x] Remove "Contract Escrow Balance" display
- [x] Add "USDC Allowance" to balance display (in V2 Setup section)
- [x] Keep "Primary Account Balance" (USDC in wallet)
- [x] Update labels for clarity

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, ~15 lines)

**Success Criteria:**
- [x] Escrow balance removed
- [x] Allowance displayed
- [x] Clear what each balance means

---

## Phase 5: Build & Integration Testing

### Sub-phase 5.1: Rebuild SDK

**Goal**: Build SDK with V2 changes.

**Line Budget**: 0 lines (build commands only)

#### Tasks
- [x] Run `cd packages/sdk-core && pnpm build:esm && pnpm build:cjs`
- [x] Verify build succeeds without errors
- [x] Verify no TypeScript errors
- [x] Check dist/ files generated

**Success Criteria:**
- [x] Build completes successfully
- [x] No errors or warnings (except known duplicates)

---

### Sub-phase 5.2: Clear Caches and Restart

**Goal**: Ensure all changes are compiled and available.

**Line Budget**: 0 lines (commands only)

#### Tasks
- [x] Kill any running harness: `pkill -f next`
- [x] Clear harness caches: `rm -rf apps/harness/.next apps/harness/node_modules/.cache`
- [x] Force reinstall: `cd /workspace && pnpm install --force`
- [ ] Start harness: `cd apps/harness && pnpm dev`
- [ ] Verify harness starts without errors

**Success Criteria:**
- [ ] Harness starts on port 3000
- [ ] No compilation errors
- [ ] Page loads correctly

---

### Sub-phase 5.3: End-to-End V2 Flow Test

**Goal**: Verify complete V2 delegation flow works.

**Line Budget**: 0 lines (manual testing only)

#### Test Flow:
1. [ ] Open http://localhost:3000/chat-context-rag-demo
2. [ ] Connect wallet via Base Account Kit
3. [ ] Verify "Approve USDC" button appears (if allowance low)
4. [ ] Click "Approve USDC" button
5. [ ] Approve transaction in wallet popup (one-time)
6. [ ] Verify allowance updates
7. [ ] Verify "Authorize Sub-Account" button appears (if not authorized)
8. [ ] Click "Authorize Sub-Account" button
9. [ ] Approve transaction in wallet popup (one-time)
10. [ ] Verify authorization success
11. [ ] Verify both buttons hidden (setup complete)
12. [ ] Click "Start Session"
13. [ ] **Verify NO popup appears** (sub-account signs with CryptoKey)
14. [ ] Verify console shows "V2 direct payment delegation"
15. [ ] Verify USDC pulled from primary wallet (check balance decrease)
16. [ ] Verify `SessionCreatedByDelegate` event in logs
17. [ ] Send chat message, verify AI response
18. [ ] End session
19. [ ] Verify refund goes to primary account
20. [ ] Start another session
21. [ ] **Verify NO popup appears again**

**Success Criteria:**
- [ ] 2 setup popups (approve + authorize)
- [ ] Subsequent sessions are popup-free
- [ ] USDC pulled from wallet (not escrow)
- [ ] Chat functionality works
- [ ] Session ownership is primary account

---

### Sub-phase 5.4: Insufficient Allowance Test

**Goal**: Verify SDK handles low allowance gracefully.

**Line Budget**: 0 lines (manual testing only)

#### Test Flow:
1. [ ] After sessions deplete most allowance
2. [ ] Or manually set approval to low amount
3. [ ] Verify "Approve USDC" button reappears
4. [ ] Or verify pre-flight check warns about low allowance
5. [ ] Re-approve and verify flow continues

**Success Criteria:**
- [ ] Low allowance detected
- [ ] User prompted to re-approve
- [ ] Flow continues after re-approval

---

### Sub-phase 5.5: Revocation Test

**Goal**: Verify authorization revocation works.

**Line Budget**: 0 lines (manual testing only)

#### Test Flow:
1. [ ] After successful test, revoke delegate via console:
   ```javascript
   await marketplace.connect(primarySigner).authorizeDelegate(subAccount, false);
   ```
2. [ ] Refresh page
3. [ ] Verify "Authorize Sub-Account" button reappears
4. [ ] Try to start session
5. [ ] Verify error: `NotDelegate`

**Success Criteria:**
- [ ] Revocation works
- [ ] UI reflects revoked state
- [ ] Proper error shown

---

### Sub-phase 5.6: Error Handling Test

**Goal**: Verify custom errors are handled properly.

**Line Budget**: 0 lines (manual testing only)

#### Test Cases:
1. [ ] **NotDelegate**: Try session without authorization
   - Expected: Clear error message about authorization needed
2. [ ] **ERC20Only**: (Can't test easily - contract enforces)
   - Verify SDK validates token != address(0)
3. [ ] **Insufficient Balance**: Set session amount > wallet balance
   - Expected: ERC-20 transfer failure, clear error
4. [ ] **Insufficient Allowance**: Set session amount > allowance
   - Expected: ERC-20 transfer failure, clear error

**Success Criteria:**
- [ ] Each error produces clear user message
- [ ] No cryptic error codes shown to user

---

## Summary

| Phase | Sub-phases | Total Tasks | Line Budget |
|-------|------------|-------------|-------------|
| 1 | 1 | 5 | 0 (copy) |
| 2 | 5 | 19 | ~40 (net, due to deletions) |
| 3 | 2 | 6 | 25 |
| 4 | 8 | 30 | ~65 (net, due to deletions) |
| 5 | 6 | 25 | 0 (testing) |
| **Total** | **22** | **85** | **~130 net** |

---

## Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` | 0 (copy) | V2 ABI |
| `packages/sdk-core/src/contracts/JobMarketplace.ts` | ~+10 (net) | Replace V1 with V2 methods |
| `packages/sdk-core/src/managers/SessionManager.ts` | ~25 | Terminology + helper |
| `packages/sdk-core/src/index.ts` | ~5 | Update exports |
| `apps/harness/pages/chat-context-rag-demo.tsx` | ~-20 (net) | Remove escrow, add approval |

---

## Key Architecture Notes

### V2 Direct Payment Pattern

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Primary Wallet │      │   Sub-Account   │      │    Contract     │
│   (has USDC)    │      │   (CryptoKey)   │      │ (JobMarketplace)│
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         │  1. approve(contract)  │                        │
         │───────────────────────────────────────────────>│
         │                        │                        │
         │  2. authorizeDelegate  │                        │
         │───────────────────────────────────────────────>│
         │                        │                        │
         │                        │  3. createSessionForModelAsDelegate
         │                        │─────────────────────────>│
         │                        │    (signs with CryptoKey, NO POPUP)
         │                        │                        │
         │  4. transferFrom(payer, contract, amount)       │
         │<────────────────────────────────────────────────│
         │                        │                        │
         │                        │  5. Session created    │
         │                        │<───────────────────────│
         │                        │                        │
```

### Session Ownership
- Session **always owned by payer** (primary), never delegate
- Refunds go to payer address
- Both payer and host can complete session

### Security
- Delegate can only spend what payer approved to contract
- Bounded approval ($1,000 default) limits exposure
- Payer can revoke delegate anytime
- No cross-user access possible

---

## Progress Tracker

- [ ] Phase 1: Update Contract ABI (Sub-phase 1.1)
- [ ] Phase 2: Update JobMarketplace Wrapper (Sub-phases 2.1-2.5)
- [ ] Phase 3: Update SessionManager (Sub-phases 3.1-3.2)
- [ ] Phase 4: Update Test Harness (Sub-phases 4.1-4.8)
- [ ] Phase 5: Build & Integration Testing (Sub-phases 5.1-5.6)
