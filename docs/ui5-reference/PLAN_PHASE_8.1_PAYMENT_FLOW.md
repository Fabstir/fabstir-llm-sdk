# Phase 8.1: Production Payment Flow Implementation

**Status**: 📋 PLANNING
**Created**: 2025-11-18
**Target**: Unblock Phase 8.1 blockchain transaction testing in UI5

## Overview

Implement production payment flow in UI5 to enable:
- Real blockchain transactions (USDC approval, deposit, job creation)
- Host selection and discovery
- Real AI inference with payment settlement
- Performance measurement for Phase 8.1 testing

**Reference Implementation**: `apps/harness/pages/chat-context-rag-demo.tsx` (1833 lines, working)

---

## Current UI5 Chat State

**What Works**:
- ✅ Session group creation and management (S5 storage)
- ✅ Chat UI components (message bubbles, input, RAG sources)
- ✅ Document upload and embedding (deferred architecture)
- ✅ Vector database management

**What's Missing** (BLOCKING Phase 8.1):
- ❌ Payment flow (USDC approval + deposit)
- ❌ Host selection UI
- ❌ Blockchain job creation (`SessionManager.startSession()`)
- ❌ WebSocket connection to production LLM nodes
- ❌ Real AI inference with streaming responses
- ❌ Payment settlement tracking

**Current Behavior**:
- Uses `SessionGroupManager.startChatSession()` → S5 metadata only (instant, no blockchain)
- No payment required
- No host connection
- No real LLM responses (messages stored but not processed)

---

## Production Flow (From Harness)

**Complete Flow** (see `chat-context-rag-demo.tsx`):
1. **Connect Wallet** → Base Account Kit (smart wallet + sub-account)
2. **Deposit USDC** → Transfer from faucet to primary account
3. **Start Session** → Discover hosts, approve USDC, create blockchain job
4. **Send Message** → Real LLM inference via WebSocket
5. **Payment Settlement** → Automatic via proofs (every 1000 tokens)
6. **End Session** → Finalize payment, close WebSocket

**Key Features**:
- Multi-chain support (Base Sepolia, opBNB Testnet)
- Auto Spend Permissions (gasless transactions after initial approval)
- Real-time balance tracking (user, host, treasury)
- Conversation persistence to S5 storage

---

## Implementation Plan

### Sub-phase 8.1.1: Payment Panel Component ✅ PLANNING

**Goal**: Create UI component for USDC deposit and balance display

**Tasks**:
- [ ] Create `components/payment/payment-panel.tsx`
- [ ] Display user balances (EOA, smart wallet, sub-account)
- [ ] Display host earnings (accumulated, wallet)
- [ ] Display treasury balances (accumulated, wallet)
- [ ] Input field for deposit amount
- [ ] "Deposit to Primary Account" button
- [ ] "Refresh Balances" button
- [ ] Auto-refresh balances every 10 seconds

**Reference**: Lines 1890-1994 in `chat-context-rag-demo.tsx`

**File Structure**:
```tsx
// components/payment/payment-panel.tsx
export interface PaymentPanelProps {
  sdk: FabstirSDKCore | null;
  primaryAccount: string;
  subAccount?: string;
  activeHost?: any;
  onDeposit: (amount: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}
```

**Dependencies**:
- SDK managers: PaymentManager, HostManager, TreasuryManager
- ethers.js for balance reading
- ChainRegistry for contract addresses

**Estimated Time**: 2 hours
**Test Strategy**: Manual verification in browser (balance display, deposit button)

---

### Sub-phase 8.1.2: Host Discovery UI ✅ PLANNING

**Goal**: Implement host discovery and selection before session start

**Tasks**:
- [ ] Add "Discover Hosts" button to chat page
- [ ] Display list of active hosts with:
  - Host address (truncated)
  - Endpoint URL
  - Supported models
  - Price per token
- [ ] Random host selection (matching harness behavior)
- [ ] Display selected host info in chat messages
- [ ] Store selected host in `window.__selectedHostAddress` for persistence
- [ ] Update DocumentManager with host endpoint for embeddings

**Reference**: Lines 1005-1082 in `chat-context-rag-demo.tsx`

**UI Flow**:
1. User clicks "Start Session"
2. System discovers hosts via `HostManager.discoverAllActiveHostsWithModels()`
3. Filter hosts that support models
4. Randomly select one host
5. Display selection in chat ("📡 Host: 0x1234...5678")
6. Proceed to payment approval

**Error Handling**:
- No active hosts → Error message
- No hosts with models → Error message
- Network timeout → Retry with backoff

**Estimated Time**: 2 hours
**Test Strategy**: Manual verification (host discovery, selection display)

---

### Sub-phase 8.1.3: USDC Approval Flow ✅ PLANNING

**Goal**: Implement USDC approval for JobMarketplace contract

**Tasks**:
- [ ] Check current USDC allowance for JobMarketplace
- [ ] If allowance insufficient, request approval
- [ ] Approve 1000 USDC (for multiple sessions)
- [ ] Wait for 3 blockchain confirmations
- [ ] Display approval status in chat messages
- [ ] Handle approval errors (insufficient balance, user rejection)

**Reference**: Lines 1125-1159 in `chat-context-rag-demo.tsx`

**Implementation**:
```typescript
// Check current allowance
const currentAllowance = await usdcContract.allowance(
  primaryAccount,
  JOB_MARKETPLACE_ADDRESS
);

// If insufficient, approve
if (currentAllowance < depositAmountWei) {
  addMessage("system", "🔐 Requesting USDC approval...");
  const approveTx = await usdcContract.approve(
    JOB_MARKETPLACE_ADDRESS,
    parseUnits("1000", 6) // Approve 1000 USDC
  );
  await approveTx.wait(3); // Wait for confirmations
  addMessage("system", "✅ USDC approved for JobMarketplace");
} else {
  addMessage("system", "✅ USDC already approved");
}
```

**Gas Estimation**:
- Approval transaction: ~50,000 gas
- With Base Account Kit: May be gasless via sub-account

**Estimated Time**: 1.5 hours
**Test Strategy**: Manual verification (approval transaction, balance check)

---

### Sub-phase 8.1.4: Session Manager Integration ✅ PLANNING

**Goal**: Switch from `SessionGroupManager.startChatSession()` to `SessionManager.startSession()`

**Tasks**:
- [ ] Import `SessionManager` from SDK
- [ ] Create session configuration object:
  ```typescript
  {
    depositAmount: "2", // $2 USDC
    pricePerToken: 2000, // 0.002 USDC per token
    proofInterval: 1000, // Checkpoint every 1000 tokens
    duration: 86400, // 1 day
    paymentToken: USDC_ADDRESS,
    useDeposit: false, // Use direct payment
    chainId: ChainId.BASE_SEPOLIA,
    model: host.models[0],
    provider: host.address,
    hostAddress: host.address,
    endpoint: host.endpoint,
  }
  ```
- [ ] Call `SessionManager.startSession(config)`
- [ ] Store `sessionId` and `jobId` in state
- [ ] Store in window object for persistence: `window.__currentSessionId`, `window.__currentJobId`
- [ ] Display session IDs in chat messages
- [ ] Handle session start errors

**Reference**: Lines 1114-1200 in `chat-context-rag-demo.tsx`

**Key Changes from Current Implementation**:
- **Before**: `SessionGroupManager.startChatSession()` → S5 metadata only
- **After**: `SessionManager.startSession()` → Blockchain job creation + payment

**Session Configuration**:
- Deposit: $2 USDC (minimum session cost)
- Price: 0.002 USDC per token (2000 wei per token)
- Proof interval: 1000 tokens (production default)
- Duration: 1 day (86400 seconds)

**Estimated Time**: 2 hours
**Test Strategy**: Manual verification (blockchain transaction, session ID display)

---

### Sub-phase 8.1.5: WebSocket Connection ✅ PLANNING

**Goal**: Establish WebSocket connection to production host for real AI inference

**Tasks**:
- [ ] Get host endpoint from selected host
- [ ] Initialize WebSocket connection via SessionManager
- [ ] Handle WebSocket events:
  - `connected` → Display in chat
  - `stream_chunk` → Append to message
  - `response` → Complete message
  - `error` → Display error
  - `disconnected` → Clean up
- [ ] Implement streaming response display
- [ ] Handle reconnection on failure
- [ ] Clean up WebSocket on session end

**Reference**: Lines 1261-1310 in `chat-context-rag-demo.tsx`

**Message Flow**:
1. User sends message → `SessionManager.sendPromptStreaming(sessionId, message)`
2. WebSocket sends encrypted message to host
3. Host responds with streaming chunks
4. UI appends chunks to message bubble in real-time
5. Final response stored to S5

**Error Handling**:
- Connection timeout → Retry with backoff
- Host unavailable → Display error, suggest new session
- Decryption failure → Display error (may indicate MITM attack)

**Estimated Time**: 3 hours
**Test Strategy**: Manual verification (send message, receive streaming response)

---

### Sub-phase 8.1.6: Message Sending Integration ✅ PLANNING

**Goal**: Update message sending to use production SessionManager

**Tasks**:
- [ ] Update `onSendMessage` handler in chat interface
- [ ] Check session is active before sending
- [ ] Call `SessionManager.sendPromptStreaming(sessionId, message)`
- [ ] Display user message immediately (optimistic update)
- [ ] Create assistant message placeholder for streaming
- [ ] Append streaming chunks to assistant message
- [ ] Track token usage for cost calculation
- [ ] Update total cost display
- [ ] Handle send errors (insufficient balance, session expired)

**Reference**: Lines 1311-1410 in `chat-context-rag-demo.tsx`

**Token Tracking**:
- Estimate tokens based on text length
- Update `totalTokens` state
- Calculate cost: `(tokens * PRICE_PER_TOKEN) / 1000000` USDC
- Display in chat UI

**Error States**:
- Session not active → "Please start a session first"
- Insufficient balance → "Insufficient USDC for message"
- Host unavailable → "Host connection lost, please start new session"

**Estimated Time**: 2 hours
**Test Strategy**: Manual verification (send message, streaming response, token tracking)

---

### Sub-phase 8.1.7: Payment Settlement Tracking ✅ PLANNING

**Goal**: Display payment settlement events and balance updates

**Tasks**:
- [ ] Listen for proof submission events (every 1000 tokens)
- [ ] Display checkpoint messages in chat
- [ ] Update host accumulated balance
- [ ] Update treasury accumulated balance
- [ ] Show payment settlement on session end
- [ ] Display final cost breakdown

**Reference**: Lines 1421-1480 in `chat-context-rag-demo.tsx`

**Event Tracking**:
- Proof submitted → "💎 Checkpoint: 1000 tokens processed"
- Balance update → Refresh all balances
- Session end → Final settlement display

**Cost Breakdown** (displayed on session end):
```
Total Tokens: 2,450
Total Cost: $4.90 USDC
Host Earned: $4.41 USDC (90%)
Treasury Fee: $0.49 USDC (10%)
```

**Estimated Time**: 2 hours
**Test Strategy**: Manual verification (checkpoint messages, balance updates)

---

### Sub-phase 8.1.8: Session End and Cleanup ✅ PLANNING

**Goal**: Properly close session and clean up resources

**Tasks**:
- [ ] Add "End Session" button to chat UI
- [ ] Call `SessionManager.endSession(sessionId)`
- [ ] Close WebSocket connection
- [ ] Save conversation to S5 storage (if not already done)
- [ ] Display final payment settlement
- [ ] Clear session state (sessionId, jobId, messages)
- [ ] Reset UI to "Start Session" state
- [ ] Update balances one final time

**Reference**: Lines 1481-1530 in `chat-context-rag-demo.tsx`

**Cleanup Checklist**:
- [x] Close WebSocket connection
- [x] Finalize blockchain payment
- [x] Save conversation to S5
- [x] Clear local state
- [x] Refresh balances
- [x] Reset UI

**Error Handling**:
- Session already ended → Graceful message
- WebSocket cleanup fails → Log but continue
- S5 save fails → Warn user about data loss

**Estimated Time**: 1.5 hours
**Test Strategy**: Manual verification (end session, cleanup, balance finalization)

---

### Sub-phase 8.1.9: Testing and Validation ✅ PLANNING

**Goal**: Create automated test for Phase 8.1 blockchain transaction measurements

**Tasks**:
- [ ] Create test file: `tests-ui5/test-payment-flow.spec.ts`
- [ ] Test complete flow:
  1. Connect wallet
  2. Deposit USDC (measure transaction time)
  3. Start session (measure approval + job creation time)
  4. Send message (measure WebSocket latency)
  5. End session (measure settlement time)
- [ ] Measure transaction times:
  - USDC approval: < 15s
  - Job creation: < 15s
  - Message send: < 5s
  - Settlement: < 15s
- [ ] Verify balances update correctly
- [ ] Take screenshots at each step
- [ ] Generate performance report

**Expected Performance** (from harness testing):
- USDC Approval: 5-10 seconds (3 confirmations)
- Job Creation: 10-15 seconds (blockchain transaction + proof)
- Message Send: 3-5 seconds (WebSocket + LLM inference)
- Settlement: 5-10 seconds (proof submission)

**Test Assertions**:
```typescript
expect(approvalTime).toBeLessThan(15000); // < 15s
expect(jobCreationTime).toBeLessThan(15000); // < 15s
expect(messageLatency).toBeLessThan(5000); // < 5s
expect(settlementTime).toBeLessThan(15000); // < 15s
```

**Estimated Time**: 3 hours
**Success Criteria**: All assertions pass, Phase 8.1 COMPLETE

---

## Implementation Order

### Recommended Sequence:

1. **Sub-phase 8.1.1** (2h) - Payment Panel UI
   - Foundation for all balance display
   - Standalone component, no dependencies on other sub-phases

2. **Sub-phase 8.1.2** (2h) - Host Discovery
   - Required before session start
   - Independent of payment flow

3. **Sub-phase 8.1.3** (1.5h) - USDC Approval
   - Must come before session creation
   - Can test independently with test wallet

4. **Sub-phase 8.1.4** (2h) - Session Manager Integration
   - Core blockchain transaction
   - Depends on: 8.1.2 (host selected), 8.1.3 (USDC approved)

5. **Sub-phase 8.1.5** (3h) - WebSocket Connection
   - Required for real AI inference
   - Depends on: 8.1.4 (session created)

6. **Sub-phase 8.1.6** (2h) - Message Sending
   - Real LLM interaction
   - Depends on: 8.1.5 (WebSocket connected)

7. **Sub-phase 8.1.7** (2h) - Payment Settlement
   - Track payment events
   - Depends on: 8.1.6 (messages sending)

8. **Sub-phase 8.1.8** (1.5h) - Session End
   - Cleanup and finalization
   - Depends on: all previous sub-phases

9. **Sub-phase 8.1.9** (3h) - Testing
   - Automated test creation
   - Depends on: all previous sub-phases

**Total Estimated Time**: 19.5 hours (~2.5 days)

---

## Dependencies

### SDK Packages:
- `@fabstir/sdk-core` (already installed)
- No additional packages needed

### SDK Managers Required:
- `SessionManager` - Blockchain job creation, WebSocket management
- `PaymentManager` - Balance reading, deposits
- `HostManager` - Host discovery, selection
- `TreasuryManager` - Treasury balance reading
- `StorageManager` - S5 conversation persistence

### Contract Addresses (from ChainRegistry):
- `jobMarketplace` - Job creation and payment
- `usdcToken` - USDC ERC20 token
- `nodeRegistry` - Host registration lookup
- `hostEarnings` - Host payment tracking
- `proofSystem` - Proof submission tracking

### Environment Variables (.env.local):
Already configured from previous phases - no changes needed.

---

## Testing Strategy

### Manual Testing Checklist:
- [ ] Payment panel displays all balances correctly
- [ ] Host discovery finds active hosts
- [ ] USDC approval transaction succeeds
- [ ] Session creation creates blockchain job
- [ ] WebSocket connection established
- [ ] Messages send and receive streaming responses
- [ ] Token tracking updates correctly
- [ ] Payment settlement events fire
- [ ] Session end cleans up properly
- [ ] Balances update after all transactions

### Automated Test Coverage:
- [ ] Sub-phase 8.1.9: Complete payment flow test
- [ ] Measure transaction times (approval, job creation, message, settlement)
- [ ] Verify balance changes
- [ ] Screenshot capture at each step
- [ ] Performance report generation

### Success Criteria:
- ✅ All 9 sub-phases complete
- ✅ Automated test passing
- ✅ Phase 8.1 status: COMPLETE
- ✅ Overall testing progress: 90.5% → 92.9% (7.43/8 phases)

---

## Risk Assessment

### High Risk:
- **WebSocket Connection** (Sub-phase 8.1.5)
  - Production hosts may be offline
  - Mitigation: Test with multiple hosts, graceful fallback

- **Transaction Timing** (Sub-phase 8.1.9)
  - Base Sepolia network congestion may cause delays
  - Mitigation: Generous timeouts, retry logic

### Medium Risk:
- **Balance Tracking** (Sub-phase 8.1.1, 8.1.7)
  - Multiple async balance reads may race
  - Mitigation: Debounce balance updates, use latest values

### Low Risk:
- **UI Components** (Sub-phase 8.1.1, 8.1.2)
  - Standard React components
  - Mitigation: Copy patterns from harness

---

## Progress Tracking

**Status Legend**:
- 📋 PLANNING - Sub-phase defined, not started
- 🔄 IN PROGRESS - Sub-phase actively being implemented
- ✅ COMPLETE - Sub-phase finished and tested
- ⚠️ BLOCKED - Sub-phase waiting on dependencies

### Current Progress:
- Sub-phase 8.1.1: 📋 PLANNING
- Sub-phase 8.1.2: 📋 PLANNING
- Sub-phase 8.1.3: 📋 PLANNING
- Sub-phase 8.1.4: 📋 PLANNING
- Sub-phase 8.1.5: 📋 PLANNING
- Sub-phase 8.1.6: 📋 PLANNING
- Sub-phase 8.1.7: 📋 PLANNING
- Sub-phase 8.1.8: 📋 PLANNING
- Sub-phase 8.1.9: 📋 PLANNING

**Overall Phase 8.1 Progress**: 0/9 sub-phases = 0% complete

---

## Notes

### Reference Implementation Notes:
- Harness uses Base Account Kit for gasless transactions (optional for UI5)
- Harness includes RAG document upload (UI5 already has this)
- Harness uses faucet for USDC deposits (UI5 should match this pattern)
- Harness displays extensive balance tracking (good UX, should replicate)

### Simplifications for UI5:
- Can skip Base Account Kit integration (use standard MetaMask)
- Can skip RAG upload UI (already implemented)
- Can simplify balance display (fewer accounts than harness)

### Future Enhancements (Post Phase 8.1):
- Multi-chain switching UI (Base Sepolia ↔ opBNB Testnet)
- Host preference selection (instead of random)
- Session history and resume
- Cost estimation before session start
- Payment analytics dashboard

---

**Last Updated**: 2025-11-18
**Next Update**: After Sub-phase 8.1.1 completion
**Estimated Completion**: 2.5 days from start
