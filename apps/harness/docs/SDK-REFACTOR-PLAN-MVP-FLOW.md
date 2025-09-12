# Refactor Plan: Convert base-usdc-mvp-flow.test.tsx to SDK Version

## Overview
Transform the 17-step USDC MVP flow from direct contract calls to using FabstirSDKCore and its managers. This will create `base-usdc-mvp-flow-sdk.test.tsx`.

## Phase 1: Setup and Initialization (Steps 1-2)
1. **Create new file**: `base-usdc-mvp-flow-sdk.test.tsx`
2. **Import SDK components**:
   - Import FabstirSDKCore from '@fabstir/sdk-core'
   - Import manager types (PaymentManager, SessionManager, HostManager, StorageManager, TreasuryManager)
3. **Replace hardcoded addresses** with environment variables:
   - Use process.env.NEXT_PUBLIC_* for all contract addresses
   - Keep test account addresses from environment
4. **Initialize SDK** in useEffect:
   - Create FabstirSDKCore instance with proper config
   - Include contractAddresses and s5Config
5. **Refactor Step 1 (Connect & Fund)**:
   - Keep Base Account SDK connection as-is
   - Replace direct ethers contract calls with PaymentManager.sendToken()
   - Authenticate SDK with TEST_USER_1 private key
6. **Refactor Step 2 (Discover Hosts)**:
   - Use HostManager.getActiveHosts() instead of direct registry calls
   - Parse host metadata using HostManager utilities

## Phase 2: Session Management (Steps 3-7)
7. **Refactor Step 3 (Create Session)**:
   - Replace direct JobMarketplace contract call with SessionManager.startSession()
   - Use SessionConfig object for parameters
   - Handle sessionId and jobId returns
8. **Add WebSocket support** for Steps 4-7:
   - Initialize WebSocketClient for real-time streaming
   - Connect to host endpoint
   - Handle prompt/response streaming
9. **Refactor inference simulation**:
   - Use SessionManager.sendPrompt() for Step 4
   - Use SessionManager.handleResponse() for Step 5
   - Track token usage with SessionManager.updateTokenCount()
   - Generate checkpoint with SessionManager.createCheckpoint()

## Phase 3: Proof and Earnings (Steps 8-10)
10. **Refactor Step 8 (Validate Proof)**:
    - Use SessionManager.validateProof() or create ProofManager if needed
    - Handle EZKL proof validation through SDK
11. **Refactor Steps 9-10 (Record Earnings)**:
    - Use HostManager.recordEarnings() for host portion
    - Use TreasuryManager.recordFees() for treasury portion
    - Calculate splits using SDK utilities

## Phase 4: Storage and Completion (Steps 11-13)
12. **Refactor Step 11 (Save to S5)**:
    - Use StorageManager.saveConversation()
    - Store session metadata with StorageManager.saveSessionMetadata()
    - Get S5 CID for reference
13. **Refactor Steps 12-13 (Close Session)**:
    - Use SessionManager.endSession() to close
    - Mark as completed with SessionManager.markCompleted()
    - Clean up WebSocket connection

## Phase 5: Settlement and Withdrawals (Steps 14-17)
14. **Refactor Steps 14-15 (USDC Settlement)**:
    - Use PaymentManager.settlePayments() for automatic settlement
    - Track transaction hashes
    - Update balances via SDK queries
15. **Refactor Step 16 (Host Withdrawal)**:
    - Use HostManager.withdrawEarnings() for each host
    - Handle accumulated balances
16. **Refactor Step 17 (Treasury Withdrawal)**:
    - Use TreasuryManager.withdrawFees()
    - Verify final balances

## Phase 6: UI and Error Handling
17. **Maintain UI components**:
    - Keep step progress indicators
    - Keep balance display
    - Keep logs display
18. **Add SDK error handling**:
    - Wrap all SDK calls in try-catch
    - Display SDKError details properly
    - Add retry logic where appropriate
19. **Update helper functions**:
    - Refactor readAllBalances() to use SDK queries
    - Update balance formatting utilities
    - Keep sub-account creation logic

## Phase 7: Testing and Cleanup
20. **Test each step individually**:
    - Add step-by-step execution option
    - Verify each SDK method works
    - Check balance updates
21. **Test full flow end-to-end**:
    - Run complete 17-step flow
    - Verify no popups when funds sufficient
    - Check S5 storage works
22. **Code cleanup**:
    - Remove unused imports (direct ethers contracts)
    - Remove hardcoded ABIs (use SDK's)
    - Add proper TypeScript types
    - Add comprehensive comments

## Key SDK Patterns to Follow
- Initialize SDK with environment variables
- Authenticate with private key before operations
- Use manager pattern (getPaymentManager(), etc.)
- Handle async operations properly
- Check manager initialization status
- Use SDK error types

## Files to Reference
- `/workspace/apps/harness/pages/subscription-flow3-sdk.tsx` - Working SDK example
- `/workspace/packages/sdk-core/src/managers/*` - Manager implementations
- `/workspace/packages/sdk-core/src/types.ts` - Type definitions
- `/workspace/apps/harness/.env.local` - Environment variables

## Original 17 Steps for Reference
1. **Connect Base Account & Fund** - Connect wallet and fund primary/sub accounts
2. **Discover Hosts** - Query available LLM hosts from registry
3. **Create Session** - Create blockchain session with USDC deposit
4. **Send Prompt** - User sends inference prompt
5. **Stream Response** - Host streams LLM response
6. **Track Tokens** - Count tokens used
7. **Submit Checkpoint** - Host submits proof checkpoint
8. **Validate Proof** - User validates EZKL proof
9. **Record Host Earnings** - 90% to host
10. **Record Treasury Fees** - 10% to treasury
11. **Save to S5** - Persist conversation to decentralized storage
12. **Close Session** - End the session
13. **Mark Complete** - Mark session as completed on blockchain
14. **Trigger Settlement** - Initiate USDC payments
15. **Settle Payments** - Execute actual transfers
16. **Host Withdrawal** - Hosts withdraw earnings
17. **Treasury Withdrawal** - Treasury withdraws fees

## Implementation Notes

### Current Working Patterns from subscription-flow3-sdk.tsx
```typescript
// SDK initialization
const sdkInstance = new FabstirSDKCore({
  mode: 'production',
  chainId: CHAIN_ID_NUM,
  rpcUrl: RPC_URL,
  contractAddresses: { /* from env */ },
  s5Config: { /* from env */ }
});

// Authentication
await sdk.authenticate('privatekey', { privateKey: TEST_USER_1_PRIVATE_KEY });

// Get manager
const pm = sdk.getPaymentManager();

// Use manager methods
await pm.sendToken(tokenAddress, toAddress, amount);
```

### Manager Methods Needed
- **PaymentManager**: sendToken(), createSessionJob(), settlePayments()
- **SessionManager**: startSession(), sendPrompt(), handleResponse(), createCheckpoint(), endSession()
- **HostManager**: getActiveHosts(), recordEarnings(), withdrawEarnings()
- **StorageManager**: saveConversation(), saveSessionMetadata()
- **TreasuryManager**: recordFees(), withdrawFees()

### Environment Variables Required
```bash
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY
NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM
NEXT_PUBLIC_CONTRACT_HOST_EARNINGS
NEXT_PUBLIC_CONTRACT_USDC_TOKEN
NEXT_PUBLIC_S5_PORTAL_URL
NEXT_PUBLIC_S5_SEED_PHRASE
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA
```

## Success Criteria
✅ All 17 steps work with SDK instead of direct contracts  
✅ No hardcoded addresses or ABIs  
✅ Proper error handling with SDK errors  
✅ S5 storage integration working  
✅ WebSocket streaming functional  
✅ Clean, maintainable code using SDK patterns  
✅ No unnecessary popups when funds are sufficient  
✅ Comprehensive logging for debugging  

## Next Steps
1. Create the new file base-usdc-mvp-flow-sdk.test.tsx
2. Start with Phase 1 (Setup and Initialization)
3. Test each phase before moving to the next
4. Ensure backward compatibility with existing flow
5. Document any new SDK methods needed