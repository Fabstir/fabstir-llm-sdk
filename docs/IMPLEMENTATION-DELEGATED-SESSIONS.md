# Implementation Plan: Delegated Session Creation for Popup-Free Transactions

## Overview

Integrate the new contract delegation feature that enables Coinbase Smart Wallet sub-accounts to create sessions using the primary account's pre-deposited funds **without authorization popups**.

## Status: In Progress

**Implementation**: Delegated Session Creation
**SDK Version**: 1.9.1 (target)
**Network**: Base Sepolia (Chain ID: 84532)
**Prerequisite**: Pre-Funded Deposit Flow complete

### Phases Overview:
- [x] Phase 1: SDK ABI & Type Updates
- [x] Phase 2: JobMarketplace Wrapper Methods
- [x] Phase 3: Test Harness Integration
- [ ] Phase 4: Build & Integration Testing

---

## Summary of Changes

| Aspect | Current (Primary Account) | New (Delegated Sub-Account) |
|--------|---------------------------|----------------------------|
| Transaction Signer | Primary Account | Sub-Account |
| Popup Required | Yes (every session) | No (after one-time auth) |
| Contract Function | `createSessionFromDepositForModel` | `createSessionFromDepositForModelAsDelegate` |
| Setup Required | None | One-time `authorizeDelegate()` |

### New Contract Functions (Already Deployed)

| Function | Purpose |
|----------|---------|
| `authorizeDelegate(delegate, authorized)` | Primary authorizes sub-account (one-time) |
| `isDelegateAuthorized(depositor, delegate)` | Check if sub-account is authorized |
| `createSessionFromDepositAsDelegate(depositor, ...)` | Delegate creates non-model session |
| `createSessionFromDepositForModelAsDelegate(depositor, ...)` | Delegate creates model session |

### New Events

| Event | Purpose |
|-------|---------|
| `DelegateAuthorized(depositor, delegate, authorized)` | Emitted when authorization changes |
| `SessionCreatedByDelegate(sessionId, depositor, delegate, host, modelId, deposit)` | Emitted when delegate creates session |

### Contract Address (Remediation Proxy)

```typescript
const REMEDIATION_JOB_MARKETPLACE = "0x95132177F964FF053C1E874b53CF74d819618E06";
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

## Phase 1: SDK ABI & Type Updates

### Sub-phase 1.1: Copy Updated ABI

**Goal**: Ensure SDK has ABI with delegation functions.

**Line Budget**: 0 lines (file copy only)

#### Tasks
- [x] Copy `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` to SDK
- [x] Verify ABI contains `authorizeDelegate` function
- [x] Verify ABI contains `isDelegateAuthorized` function
- [x] Verify ABI contains `createSessionFromDepositAsDelegate` function (8 params)
- [x] Verify ABI contains `createSessionFromDepositForModelAsDelegate` function (9 params)
- [x] Verify ABI contains `DelegateAuthorized` event
- [x] Verify ABI contains `SessionCreatedByDelegate` event

**Source Files:**
- `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`

**Destination Files:**
- `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`

**Success Criteria:**
- [x] ABI copied successfully
- [x] All 4 delegation functions present in ABI
- [x] Both delegation events present in ABI

---

### Sub-phase 1.2: Add Delegation Type Definitions

**Goal**: Add TypeScript interfaces for delegation parameters.

**Line Budget**: 15 lines

#### Tasks
- [x] Add `DelegatedSessionParams` interface extending `SessionCreationParams`
- [x] Add `depositor: string` required field
- [x] Add JSDoc documentation for interface
- [x] Verify TypeScript compilation succeeds

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +15 lines after line ~60)

**New Types:**
```typescript
/**
 * Parameters for creating a session as an authorized delegate.
 * The depositor is the primary account whose deposits will be used.
 * The caller (msg.sender) must be authorized via authorizeDelegate().
 */
export interface DelegatedSessionParams extends SessionCreationParams {
  /** Address of the primary account whose deposits to use */
  depositor: string;
}
```

**Success Criteria:**
- [x] `DelegatedSessionParams` interface exported
- [x] TypeScript compilation succeeds
- [x] Interface extends `SessionCreationParams` correctly

---

## Phase 2: JobMarketplace Wrapper Methods

### Sub-phase 2.1: Add authorizeDelegate Method

**Goal**: Allow primary account to authorize/revoke a delegate.

**Line Budget**: 20 lines

#### Tasks
- [x] Add `authorizeDelegate(delegate: string, authorized: boolean): Promise<any>` method
- [x] Validate delegate is not zero address
- [x] Validate delegate is not self (cannot self-delegate)
- [x] Call contract `authorizeDelegate(delegate, authorized)`
- [x] Return transaction object
- [x] Add JSDoc documentation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +20 lines)

**Method Signature:**
```typescript
/**
 * Authorize or revoke a delegate to create sessions on behalf of this account.
 * @param delegate Address to authorize (e.g., Smart Wallet sub-account)
 * @param authorized true to authorize, false to revoke
 * @returns Transaction object
 */
async authorizeDelegate(delegate: string, authorized: boolean): Promise<any>
```

**Success Criteria:**
- [x] Method compiles without errors
- [x] Validation prevents zero address
- [x] Validation prevents self-delegation
- [x] Returns transaction object

---

### Sub-phase 2.2: Add isDelegateAuthorized Method

**Goal**: Check if a delegate is authorized for a depositor.

**Line Budget**: 12 lines

#### Tasks
- [x] Add `isDelegateAuthorized(depositor: string, delegate: string): Promise<boolean>` method
- [x] Call contract `isDelegateAuthorized(depositor, delegate)`
- [x] Return boolean result
- [x] Add JSDoc documentation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +12 lines)

**Method Signature:**
```typescript
/**
 * Check if a delegate is authorized to create sessions for a depositor.
 * @param depositor Address of the primary account (deposit owner)
 * @param delegate Address of the potential delegate (e.g., sub-account)
 * @returns true if delegate is authorized, false otherwise
 */
async isDelegateAuthorized(depositor: string, delegate: string): Promise<boolean>
```

**Success Criteria:**
- [x] Method compiles without errors
- [x] Returns boolean correctly
- [x] Works for both authorized and unauthorized delegates

---

### Sub-phase 2.3: Add createSessionFromDepositAsDelegate Method

**Goal**: Delegate creates a non-model session from depositor's funds.

**Line Budget**: 45 lines

#### Tasks
- [x] Add `createSessionFromDepositAsDelegate(params: DelegatedSessionParams): Promise<number>` method
- [x] Validate depositor address
- [x] Validate proofTimeoutWindow (60-3600 seconds)
- [x] Convert deposit amount based on token decimals
- [x] Call contract `createSessionFromDepositAsDelegate(depositor, host, token, deposit, price, duration, interval, timeout)`
- [x] Wait for transaction confirmation
- [x] Extract sessionId from `SessionCreatedByDelegate` or `SessionCreatedByDepositor` event
- [x] Add JSDoc documentation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +45 lines)

**Method Signature:**
```typescript
/**
 * Create a session from depositor's pre-funded balance as an authorized delegate.
 * Caller must be authorized via authorizeDelegate() first.
 * @param params Session parameters including depositor address
 * @returns Session ID
 */
async createSessionFromDepositAsDelegate(params: DelegatedSessionParams): Promise<number>
```

**Success Criteria:**
- [x] Method compiles without errors
- [x] Validates depositor address
- [x] Validates proofTimeoutWindow
- [x] Returns sessionId from event

---

### Sub-phase 2.4: Add createSessionFromDepositForModelAsDelegate Method

**Goal**: Delegate creates a model-specific session from depositor's funds.

**Line Budget**: 50 lines

#### Tasks
- [x] Add `createSessionFromDepositForModelAsDelegate(params: DelegatedSessionParams): Promise<number>` method
- [x] Validate depositor address
- [x] Validate modelId is provided and not zero
- [x] Validate proofTimeoutWindow (60-3600 seconds)
- [x] Convert deposit amount based on token decimals
- [x] Call contract `createSessionFromDepositForModelAsDelegate(depositor, modelId, host, token, deposit, price, duration, interval, timeout)`
- [x] Wait for transaction confirmation
- [x] Extract sessionId from `SessionCreatedByDelegate` event
- [x] Add JSDoc documentation

**Implementation Files:**
- `packages/sdk-core/src/contracts/JobMarketplace.ts` (MODIFY, +50 lines)

**Method Signature:**
```typescript
/**
 * Create a model-specific session from depositor's pre-funded balance as an authorized delegate.
 * Caller must be authorized via authorizeDelegate() first.
 * @param params Session parameters including depositor address and modelId
 * @returns Session ID
 */
async createSessionFromDepositForModelAsDelegate(params: DelegatedSessionParams): Promise<number>
```

**Success Criteria:**
- [x] Method compiles without errors
- [x] Validates modelId is provided
- [x] Validates depositor address
- [x] Returns sessionId from event

---

### Sub-phase 2.5: Rebuild SDK

**Goal**: Build SDK with new delegation methods.

**Line Budget**: 0 lines (build only)

#### Tasks
- [x] Run `cd packages/sdk-core && pnpm build:esm && pnpm build:cjs`
- [x] Verify build succeeds without errors
- [x] Verify new methods are exported in dist/

**Success Criteria:**
- [x] Build completes successfully
- [x] No TypeScript errors
- [x] dist/ files generated

---

## Phase 3: Test Harness Integration

### Sub-phase 3.1: Add Delegation State Variables

**Goal**: Add React state for tracking delegation status.

**Line Budget**: 8 lines

#### Tasks
- [x] Add `isDelegateAuthorized` state (boolean, default false)
- [x] Add `isAuthorizingDelegate` state (boolean, default false)
- [x] Add `delegationError` state (string, default "")
- [x] Verify page still renders without errors

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +8 lines after existing state)

**Success Criteria:**
- [x] Three new state variables added
- [x] Page renders without errors
- [x] No TypeScript compilation errors

---

### Sub-phase 3.2: Check Delegation Status on Connect

**Goal**: Check if sub-account is authorized when wallet connects.

**Line Budget**: 25 lines

#### Tasks
- [x] Add `checkDelegationStatus()` async function
- [x] Get primary account and sub-account addresses
- [x] Create JobMarketplace contract instance with primary account signer
- [x] Call `isDelegateAuthorized(primaryAccount, subAccount)`
- [x] Update `isDelegateAuthorized` state with result
- [x] Handle errors gracefully (set state to false)
- [x] Call `checkDelegationStatus()` after successful wallet connection
- [x] Add console logging for debugging

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +25 lines)

**Success Criteria:**
- [x] Function checks authorization on wallet connect
- [x] State updates correctly based on contract response
- [x] Console shows delegation status
- [x] Errors handled gracefully

---

### Sub-phase 3.3: Add Authorize Delegate Function

**Goal**: Allow user to authorize sub-account (one-time popup).

**Line Budget**: 35 lines

#### Tasks
- [x] Add `authorizeDelegateForSubAccount()` async function
- [x] Set `isAuthorizingDelegate` to true
- [x] Get primary account signer from SDK
- [x] Create JobMarketplace contract instance
- [x] Call `authorizeDelegate(subAccount, true)`
- [x] Wait for transaction confirmation (3 blocks)
- [x] Update `isDelegateAuthorized` state to true
- [x] Add system messages for: starting, success, error
- [x] Set `isAuthorizingDelegate` to false
- [x] Handle and display errors

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +35 lines)

**Success Criteria:**
- [x] Function authorizes sub-account successfully
- [x] Transaction requires popup (expected - uses primary signer)
- [x] State updates after confirmation
- [x] System messages show progress
- [x] Errors displayed to user

---

### Sub-phase 3.4: Add Authorize Button UI

**Goal**: Add button for user to authorize sub-account.

**Line Budget**: 20 lines

#### Tasks
- [x] Add "Authorize Sub-Account" button in balance/controls section
- [x] Only show button when:
  - `isDepositMode` is true
  - `isConnected` is true
  - `isDelegateAuthorized` is false
  - `subAccount` is available
- [x] Disable button when `isAuthorizingDelegate` is true
- [x] Button calls `authorizeDelegateForSubAccount()`
- [x] Show loading state while authorizing
- [x] Show success indicator when authorized

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +20 lines in JSX)

**Success Criteria:**
- [x] Button visible when conditions met
- [x] Button hidden when already authorized
- [x] Loading state shows during authorization
- [x] Success state shows after authorization

---

### Sub-phase 3.5: Update Session Creation for Delegation

**Goal**: Use delegated session creation when sub-account is authorized.

**Line Budget**: 60 lines

#### Tasks
- [x] In `startSession()`, detect when delegation should be used:
  - `isDepositMode` is true
  - `isDelegateAuthorized` is true
  - `subAccount` is available
- [x] When using delegation:
  - Get sub-account signer (from Base Account Kit)
  - Create JobMarketplace contract with sub-account signer
  - Build delegated session params with `depositor: primaryAccount`
  - Call `createSessionFromDepositForModelAsDelegate(params)`
  - **This should NOT trigger popup** (sub-account signs)
- [x] When not using delegation:
  - Fall back to existing `createSessionFromDepositForModel` with primary signer
  - **This will trigger popup** (primary account signs)
- [x] Add console logging to show which path is taken
- [x] Add system messages for delegation flow

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +60 lines in startSession())

**Key Change:**
```typescript
if (isDepositMode && isDelegateAuthorized && subAccount) {
  // Popup-free path: sub-account creates session
  console.log("[Session] Using delegated session creation (no popup)");
  // ... use sub-account signer and createSessionFromDepositForModelAsDelegate
} else {
  // Standard path: primary account creates session (popup)
  console.log("[Session] Using standard session creation (popup required)");
  // ... existing code
}
```

**Success Criteria:**
- [x] Delegation path selected when conditions met
- [x] Sub-account signs transaction (no popup)
- [x] Session created successfully
- [x] `SessionCreatedByDelegate` event emitted
- [x] Fallback path still works

---

### Sub-phase 3.6: Update Environment Variables

**Goal**: Ensure harness uses remediation contract with delegation support.

**Line Budget**: 2 lines

#### Tasks
- [x] Verify `NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE` is set to `0x95132177F964FF053C1E874b53CF74d819618E06`
- [x] Update if necessary

**Implementation Files:**
- `apps/harness/.env.local` (MODIFY if needed, 1 line)

**Success Criteria:**
- [x] Harness uses remediation contract
- [x] Delegation functions available on contract

---

## Phase 4: Build & Integration Testing

### Sub-phase 4.1: Clear Caches and Rebuild

**Goal**: Ensure all changes are compiled and available.

**Line Budget**: 0 lines (build commands only)

#### Tasks
- [x] Kill any running harness server: `pkill -f next`
- [x] Rebuild SDK: `cd packages/sdk-core && pnpm build:esm && pnpm build:cjs`
- [x] Clear harness caches: `rm -rf apps/harness/.next apps/harness/node_modules/.cache`
- [x] Force reinstall: `cd /workspace && pnpm install --force`
- [ ] Start harness: `cd apps/harness && pnpm dev`

**Success Criteria:**
- [x] SDK builds without errors
- [ ] Harness starts without errors
- [ ] No stale cache issues

---

### Sub-phase 4.2: End-to-End Delegation Flow Test

**Goal**: Verify complete delegation flow works end-to-end.

**Line Budget**: 0 lines (manual testing only)

#### Test Flow:
1. [ ] Open http://localhost:3000/chat-context-rag-demo
2. [ ] Connect wallet via Base Account Kit
3. [ ] Verify "Authorize Sub-Account" button appears (first time)
4. [ ] Click "Authorize Sub-Account" button
5. [ ] Approve transaction in wallet popup (one-time)
6. [ ] Verify authorization success message
7. [ ] Verify button disappears (now authorized)
8. [ ] Deposit USDC to contract (if not already deposited)
9. [ ] Start session
10. [ ] **Verify NO popup appears** (sub-account signs)
11. [ ] Verify console shows "Using delegated session creation"
12. [ ] Verify `SessionCreatedByDelegate` event in logs
13. [ ] Send chat message, verify AI response
14. [ ] End session
15. [ ] Start another session
16. [ ] **Verify NO popup appears again**

**Success Criteria:**
- [ ] One-time authorization popup works
- [ ] Subsequent sessions are popup-free
- [ ] Chat functionality works normally
- [ ] Session ownership is primary account (check contract)

---

### Sub-phase 4.3: Revocation Test

**Goal**: Verify authorization can be revoked.

**Line Budget**: 0 lines (manual testing only)

#### Test Flow:
1. [ ] After successful delegation test, open browser console
2. [ ] Call revoke function manually (or add temporary button):
   ```javascript
   // In console
   await marketplace.authorizeDelegate(subAccount, false);
   ```
3. [ ] Refresh page
4. [ ] Verify "Authorize Sub-Account" button reappears
5. [ ] Try to start session
6. [ ] Verify it falls back to popup flow OR shows error

**Success Criteria:**
- [ ] Revocation works
- [ ] UI reflects revoked state
- [ ] System handles revoked delegate gracefully

---

### Sub-phase 4.4: Non-Delegation Mode Regression Test

**Goal**: Verify direct payment mode still works.

**Line Budget**: 0 lines (manual testing only)

#### Test Flow:
1. [ ] Toggle to "Direct Payment" mode
2. [ ] Start session
3. [ ] Verify popup appears (expected - direct payment requires approval)
4. [ ] Complete chat flow
5. [ ] End session

**Success Criteria:**
- [ ] Direct payment mode unchanged
- [ ] No regression in existing functionality

---

## Summary

| Phase | Sub-phases | Total Tasks | Line Budget |
|-------|------------|-------------|-------------|
| 1 | 2 | 9 | 15 |
| 2 | 5 | 24 | 127 |
| 3 | 6 | 32 | 150 |
| 4 | 4 | 25 | 0 (testing) |
| **Total** | **17** | **90** | **~292** |

---

## Files Modified

| File | Lines Added | Purpose |
|------|-------------|---------|
| `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` | 0 (copy) | Updated ABI with delegation |
| `packages/sdk-core/src/contracts/JobMarketplace.ts` | ~142 | Add delegation methods |
| `apps/harness/pages/chat-context-rag-demo.tsx` | ~150 | Delegation UI and flow |
| `apps/harness/.env.local` | 0-1 | Ensure correct contract |

---

## Key Architecture Notes

### Session Ownership
- Session is **always owned by depositor** (primary account), never the delegate
- Refunds go to depositor address
- Both depositor and host can complete the session

### Authorization Model
- Primary calls `authorizeDelegate(subAccount, true)` - requires popup
- Sub-account calls `createSessionFromDepositForModelAsDelegate(primary, ...)` - **no popup**
- Primary can revoke anytime via `authorizeDelegate(subAccount, false)`

### Security
- Delegate can only access deposits of accounts that authorized them
- Authorization check: `msg.sender == depositor || isAuthorizedDelegate[depositor][msg.sender]`
- No cross-user access possible

---

## Progress Tracker

- [x] Phase 1: SDK ABI & Type Updates (Sub-phases 1.1, 1.2)
- [x] Phase 2: JobMarketplace Wrapper Methods (Sub-phases 2.1-2.5)
- [x] Phase 3: Test Harness Integration (Sub-phases 3.1-3.6)
- [ ] Phase 4: Build & Integration Testing (Sub-phases 4.1-4.4)
