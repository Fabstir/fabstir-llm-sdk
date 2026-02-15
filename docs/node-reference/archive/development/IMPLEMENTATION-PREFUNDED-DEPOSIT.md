# Implementation Plan: Pre-Funded Deposit Flow

## Overview

Enable users to pre-fund deposits to the JobMarketplace contract, then create multiple chat sessions from that deposit until it runs dry. This tests the AUDIT-F5 `createSessionFromDepositForModel()` function.

## Status: In Progress (Phases 1-4 Complete, Ready for Testing)

**Implementation**: Pre-Funded Deposit Flow for Test Harness
**Target File**: `apps/harness/pages/chat-context-rag-demo.tsx`
**Network**: Base Sepolia (Chain ID: 84532)
**Prerequisite**: AUDIT Pre-Report Remediation complete (SDK 1.9.0)

### Phases Overview:
- [x] Phase 1: UI State Variables
- [x] Phase 2: Contract Deposit Functions
- [x] Phase 3: Session Creation with Deposit
- [x] Phase 4: UI Controls
- [ ] Phase 5: Integration Testing

---

## Summary of Changes

| Aspect | Current (Direct Payment) | New (Pre-Funded Deposit) |
|--------|--------------------------|--------------------------|
| Payment Location | User's Primary Account | JobMarketplace Contract |
| Session Creation | Transfer per session | Use existing deposit |
| SDK Parameter | `useDeposit: false` | `useDeposit: true` |
| Contract Function | `createSessionJobWithToken` | `createSessionFromDepositForModel` |

### SDK Functions Already Available

PaymentManagerMultiChain already has these methods (cast to `any` to access from test harness):

| Method | Purpose |
|--------|---------|
| `depositToken(token, amount, chainId)` | Deposit ERC20 to contract escrow |
| `withdrawToken(token, amount, chainId)` | Withdraw ERC20 from contract escrow |
| `getDepositBalances(tokens[], chainId)` | Query deposit balances |

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: UI State Variables

### Sub-phase 1.1: Add Deposit State

**Goal**: Add React state variables for deposit mode and contract deposit tracking.

**Line Budget**: 5 lines

#### Tasks
- [x] Add `contractDeposit` state (string, default "0")
- [x] Add `depositToContract` state (string, default "5")
- [x] Add `isDepositMode` state (boolean, default true)
- [x] Verify page still renders without errors

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +5 lines after line ~157)

**Success Criteria:**
- [x] Three new state variables added
- [x] Page renders without errors
- [x] No TypeScript compilation errors

---

## Phase 2: Contract Deposit Functions

### Sub-phase 2.1: Read Contract Deposit Balance

**Goal**: Add function to read user's deposit balance from JobMarketplace contract.

**Line Budget**: 20 lines

#### Tasks
- [x] Add `readContractDepositBalance()` async function
- [x] Call `paymentManager.getDepositBalances([USDC], chainId)` (cast to any)
- [x] Return token balance from response or "0" on error
- [x] Integrate into `readAllBalances()` - call and update `contractDeposit` state
- [x] Verify balance displays correctly in browser console

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +20 lines)

**Success Criteria:**
- [x] Function returns deposit balance as string
- [x] Balance updates in state on refresh
- [x] Errors handled gracefully (return "0")

---

### Sub-phase 2.2: Deposit USDC to Contract

**Goal**: Add function to deposit USDC from primary account to JobMarketplace contract.

**Line Budget**: 45 lines

#### Tasks
- [x] Add `depositToContractEscrow()` async function
- [x] Check primary account has sufficient USDC balance
- [x] Check/request USDC approval for JobMarketplace contract
- [x] Call `paymentManager.depositToken(USDC, amount, chainId)` (cast to any)
- [x] Add system messages for: starting, approving, depositing, success, error
- [x] Refresh balances after successful deposit
- [ ] Test deposit flow manually in browser

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +45 lines)

**Success Criteria:**
- [ ] USDC transfers from primary account to contract
- [ ] Contract deposit balance increases
- [ ] Primary account balance decreases
- [x] System messages show progress

---

### Sub-phase 2.3: Withdraw USDC from Contract

**Goal**: Add function to withdraw USDC from JobMarketplace contract back to primary account.

**Line Budget**: 25 lines

#### Tasks
- [x] Add `withdrawFromContractEscrow()` async function
- [x] Call `paymentManager.withdrawToken(USDC, amount, chainId)` (cast to any)
- [x] Add system messages for: starting, success, error
- [x] Refresh balances after successful withdrawal
- [ ] Test withdrawal flow manually in browser

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +25 lines)

**Success Criteria:**
- [ ] USDC transfers from contract to primary account
- [ ] Contract deposit balance decreases to 0
- [ ] Primary account balance increases
- [x] System messages show progress

---

## Phase 3: Session Creation with Deposit

### Sub-phase 3.1: Update startSession() Logic

**Goal**: Modify session creation to use pre-funded deposit when deposit mode is enabled.

**Line Budget**: 30 lines modified

#### Tasks
- [x] Add deposit balance check when `isDepositMode` is true
- [x] Throw descriptive error if insufficient contract deposit
- [x] Change `useDeposit` in sessionConfig from `false` to `isDepositMode`
- [x] Skip USDC approval step when `isDepositMode` is true (funds already in contract)
- [x] Add system message showing deposit balance being used
- [ ] Test session creation with `useDeposit: true`
- [ ] Verify console shows `createSessionFromDepositForModel` being called

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, ~30 lines in startSession())

**Key Change:**
```typescript
// Line ~1135 change from:
useDeposit: false,
// To:
useDeposit: isDepositMode,
```

**Success Criteria:**
- [ ] Session creates successfully with `useDeposit: true`
- [ ] SDK calls `createSessionFromDepositForModel` (visible in console logs)
- [ ] Contract deposit balance decreases after session creation
- [ ] Session works normally (chat, proofs, end session)

---

## Phase 4: UI Controls

### Sub-phase 4.1: Payment Mode Toggle

**Goal**: Add toggle button to switch between deposit mode and direct payment mode.

**Line Budget**: 15 lines

#### Tasks
- [x] Add toggle button in balance/controls section
- [x] Button shows current mode: "Pre-Funded Deposit" or "Direct Payment"
- [x] Clicking toggles `isDepositMode` state
- [x] Style to clearly indicate active mode (purple for deposit, gray for direct)

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +15 lines in JSX)

**Success Criteria:**
- [x] Toggle button visible in UI
- [x] Clicking changes `isDepositMode` state
- [x] Visual feedback shows current mode

---

### Sub-phase 4.2: Contract Deposit Display

**Goal**: Add UI card showing contract deposit balance and estimated sessions available.

**Line Budget**: 15 lines

#### Tasks
- [x] Add balance card with purple styling (distinct from other balances)
- [x] Show contract deposit amount in USDC
- [x] Calculate and show estimated sessions: `floor(deposit / SESSION_DEPOSIT_AMOUNT)`
- [x] Only show card when `isDepositMode` is true

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +15 lines in JSX)

**Success Criteria:**
- [x] Balance card visible when deposit mode enabled
- [x] Shows correct contract deposit amount
- [x] Shows estimated sessions available
- [x] Hidden when direct payment mode selected

---

### Sub-phase 4.3: Deposit/Withdraw Controls

**Goal**: Add input and buttons for depositing and withdrawing from contract.

**Line Budget**: 25 lines

#### Tasks
- [x] Add number input for deposit amount (default "5", min "0.5", step "0.5")
- [x] Add "Deposit" button wired to `depositToContractEscrow()`
- [x] Add "Withdraw All" button wired to `withdrawFromContractEscrow()`
- [x] Disable Deposit button when loading or no amount entered
- [x] Disable Withdraw button when loading or contract deposit is 0
- [x] Only show controls when `isDepositMode` is true

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +25 lines in JSX)

**Success Criteria:**
- [x] Input accepts deposit amount
- [x] Deposit button calls `depositToContractEscrow()`
- [x] Withdraw button calls `withdrawFromContractEscrow()`
- [x] Buttons disabled appropriately
- [x] Controls hidden when direct payment mode

---

## Phase 5: Integration Testing

### Sub-phase 5.1: End-to-End Deposit Flow Test

**Goal**: Verify complete deposit flow works end-to-end.

**Line Budget**: 0 lines (manual testing only)

#### Tasks
- [ ] Start harness: `cd apps/harness && pnpm dev`
- [ ] Open http://localhost:3000/chat-context-rag-demo
- [ ] Connect wallet via Base Account Kit
- [ ] Verify deposit mode toggle visible and works
- [ ] Deposit $5 USDC to contract
- [ ] Verify contract deposit balance shows $5
- [ ] Verify estimated sessions shows correct count
- [ ] Start session (should use `createSessionFromDepositForModel`)
- [ ] Send chat message, verify AI response
- [ ] End session
- [ ] Verify contract deposit decreased by session cost ($0.50)
- [ ] Start another session from remaining deposit
- [ ] Withdraw remaining deposit
- [ ] Verify USDC returned to primary account

**Success Criteria:**
- [ ] All manual test steps pass
- [ ] Multiple sessions can be created from single deposit
- [ ] Withdrawal returns unused funds

---

### Sub-phase 5.2: Direct Payment Mode Regression Test

**Goal**: Verify direct payment mode still works after changes.

**Line Budget**: 0 lines (manual testing only)

#### Tasks
- [ ] Toggle to "Direct Payment" mode
- [ ] Verify contract deposit UI hidden
- [ ] Start session (should use `createSessionJobWithToken`)
- [ ] Verify chat works normally
- [ ] End session and verify payment processed

**Success Criteria:**
- [ ] Direct payment mode unchanged
- [ ] No regression in existing functionality

---

## Summary

| Phase | Sub-phases | Total Tasks | Line Budget |
|-------|------------|-------------|-------------|
| 1 | 1 | 4 | 5 |
| 2 | 3 | 17 | 90 |
| 3 | 1 | 7 | 30 |
| 4 | 3 | 11 | 55 |
| 5 | 2 | 17 | 0 (testing) |
| **Total** | **10** | **56** | **~180** |

---

## Files Modified

| File | Lines Added | Purpose |
|------|-------------|---------|
| `apps/harness/pages/chat-context-rag-demo.tsx` | ~180 | Add deposit mode UI and logic |

---

## Progress Tracker

- [x] Phase 1: UI State Variables (Sub-phase 1.1)
- [x] Phase 2: Contract Deposit Functions (Sub-phases 2.1, 2.2, 2.3)
- [x] Phase 3: Session Creation with Deposit (Sub-phase 3.1)
- [x] Phase 4: UI Controls (Sub-phases 4.1, 4.2, 4.3)
- [ ] Phase 5: Integration Testing (Sub-phases 5.1, 5.2)
