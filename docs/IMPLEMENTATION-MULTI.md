# Fabstir SDK Multi-Chain/Multi-Wallet Implementation Plan

## Overview

Systematic upgrade of the Fabstir SDK (`@fabstir/sdk-core`) to support multiple blockchain networks and wallet providers while maintaining backward compatibility. Implementation follows strict TDD bounded autonomy approach with incremental sub-phases.

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST, then implementation
2. **Bounded Autonomy**: Each sub-phase has strict boundaries and line limits
3. **Incremental Progress**: Build on previous sub-phases without breaking them
4. **Backward Compatibility**: Existing code must continue working
5. **No Mocks**: Use real implementations, no mocking allowed

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase (typically 50-150 lines)
- **Test First**: Tests must be written before implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Clear Boundaries**: Each sub-phase is independently verifiable

## Phase 1: Core Abstractions (Foundation)

### Sub-phase 1.1: Wallet Provider Interface
**Goal**: Define the contract all wallet providers must implement

**Tasks**:
- [ ] Write tests in `tests/interfaces/wallet-provider.test.ts` (100 lines)
- [ ] Create `packages/sdk-core/src/interfaces/IWalletProvider.ts` (50 lines max)
- [ ] Create `packages/sdk-core/src/types/wallet.types.ts` (30 lines max)
- [ ] Verify all tests pass
- [ ] Verify TypeScript compilation succeeds

**Test Requirements**:
```typescript
// Tests must verify:
- Interface has all required methods
- Type definitions are exported
- WalletType enum has correct values
- WalletCapabilities structure is correct
- TransactionRequest/Response types are compatible
```

**Claude Code Prompt**:
```
Create IWalletProvider interface with all required methods.
Write tests FIRST in tests/interfaces/wallet-provider.test.ts
Interface max 50 lines, types max 30 lines.
No implementation, just interface definition.
```

### Sub-phase 1.2: Chain Configuration Registry
**Goal**: Central registry of all supported chains and their configurations

**Tasks**:
- [ ] Write tests in `tests/config/chains.test.ts` (150 lines)
- [ ] Create `packages/sdk-core/src/config/chains.ts` (150 lines max)
- [ ] Create `packages/sdk-core/src/config/contracts.ts` (100 lines max)
- [ ] Verify Base Sepolia config matches .env.test
- [ ] Verify opBNB testnet config is complete
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- Base Sepolia configuration is correct
- opBNB testnet configuration is correct
- Contract addresses match .env.test for Base Sepolia
- Native currency configs are correct (ETH vs BNB)
- Chain IDs and hex values are accurate
```

**Claude Code Prompt**:
```
Create chain configuration registry with Base Sepolia and opBNB testnet.
Write tests FIRST in tests/config/chains.test.ts
Use contract addresses from .env.test for Base Sepolia.
Max 150 lines for chains.ts, 100 for contracts.ts
```

### Sub-phase 1.3: Error Definitions
**Goal**: Define all multi-chain/wallet specific errors

**Tasks**:
- [ ] Write tests in `tests/errors/multi-chain.test.ts` (80 lines)
- [ ] Create `packages/sdk-core/src/errors/multi-chain.errors.ts` (50 lines max)
- [ ] Implement UnsupportedChainError
- [ ] Implement WalletNotConnectedError
- [ ] Implement ChainMismatchError
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- UnsupportedChainError has proper structure
- WalletNotConnectedError includes wallet type
- ChainMismatchError shows expected vs actual
- All errors extend base Error class
```

**Claude Code Prompt**:
```
Create error classes for multi-chain/wallet scenarios.
Write tests FIRST in tests/errors/multi-chain.test.ts
Max 50 lines for error definitions.
Include helpful error messages.
```

## Phase 2: Wallet Provider Implementations

### Sub-phase 2.1: Base EOA Provider
**Goal**: Implement provider for standard EOA wallets (MetaMask, Rainbow, etc.)

**Tasks**:
- [ ] Write tests in `tests/providers/eoa-provider.test.ts` (200 lines)
- [ ] Create `packages/sdk-core/src/providers/EOAProvider.ts` (150 lines max)
- [ ] Implement connect() method
- [ ] Implement getAddress() and getDepositAccount()
- [ ] Implement sendTransaction() with signer
- [ ] Implement getBalance() for native and tokens
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- connect() requests accounts
- getAddress() returns correct address
- getDepositAccount() returns same as getAddress()
- sendTransaction() uses signer
- getBalance() works for native and tokens
- switchChain() changes network
- No gas in EOA transactions
```

**Claude Code Prompt**:
```
Implement EOAProvider class implementing IWalletProvider.
Write tests FIRST in tests/providers/eoa-provider.test.ts
Max 150 lines for implementation.
Use ethers.BrowserProvider for web3 interactions.
Deposit account same as user account for EOA.
```

### Sub-phase 2.2: Base Account Kit Provider Core
**Goal**: Implement Base Account Kit provider with smart accounts

**Tasks**:
- [ ] Write tests in `tests/providers/base-account-kit.test.ts` (250 lines)
- [ ] Create `packages/sdk-core/src/providers/BaseAccountKitProvider.ts` (200 lines max)
- [ ] Implement connect() with sub-account creation
- [ ] Implement getDepositAccount() returning primary account
- [ ] Implement sendTransaction() with wallet_sendCalls
- [ ] Implement gasless capability flags
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- connect() creates/gets sub-account
- getDepositAccount() returns primary account
- Sub-account has spend permissions
- wallet_sendCalls used for transactions
- Gasless capability is true
- Batch transaction capability is true
```

**Claude Code Prompt**:
```
Implement BaseAccountKitProvider with sub-account creation.
Write tests FIRST in tests/providers/base-account-kit.test.ts
Max 200 lines for implementation.
Primary account holds deposits, sub-account executes.
Must handle wallet_sendCalls for gasless transactions.
```

### Sub-phase 2.3: Provider Transaction Handling
**Goal**: Implement transaction submission and monitoring

**Tasks**:
- [ ] Write tests in `tests/providers/transaction-handler.test.ts` (150 lines)
- [ ] Create `packages/sdk-core/src/providers/transaction-handler.ts` (100 lines max)
- [ ] Handle EOA standard transactions
- [ ] Handle Base Account Kit wallet_sendCalls
- [ ] Implement transaction polling
- [ ] Add error handling
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- EOA uses standard eth_sendTransaction
- Base Account Kit uses wallet_sendCalls
- Transaction polling for Base Account Kit
- Error handling for failed transactions
- Correct response format returned
```

**Claude Code Prompt**:
```
Create transaction handler for different provider types.
Write tests FIRST in tests/providers/transaction-handler.test.ts
Max 100 lines for handler.
Must support both standard and wallet_sendCalls methods.
```

## Phase 3: SDK Core Updates

### Sub-phase 3.1: SDK Authentication Refactor
**Goal**: Update SDK to accept wallet providers instead of just signers

**Tasks**:
- [ ] Write tests in `tests/sdk/authentication.test.ts` (200 lines)
- [ ] Update authenticate() to accept IWalletProvider
- [ ] Maintain backward compatibility with ethers.Signer
- [ ] Auto-detect chain from wallet provider
- [ ] Reinitialize managers on authentication
- [ ] Add getCurrentChain() method
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- authenticate() accepts IWalletProvider
- authenticate() still accepts ethers.Signer (backward compat)
- Chain config auto-detected from wallet
- Managers reinitialize on chain change
- getCurrentChain() returns correct config
```

**Claude Code Prompt**:
```
Update FabstirSDKCore.authenticate() to accept IWalletProvider.
Write tests FIRST in tests/sdk/authentication.test.ts
Maintain backward compatibility with ethers.Signer.
Auto-detect chain from wallet provider.
Max 100 new lines in FabstirSDKCore.ts
```

### Sub-phase 3.2: Chain Switching
**Goal**: Implement chain switching functionality

**Tasks**:
- [ ] Write tests in `tests/sdk/chain-switching.test.ts` (150 lines)
- [ ] Add switchChain() method to FabstirSDKCore
- [ ] Call wallet provider's switchChain()
- [ ] Reinitialize managers with new chain
- [ ] Update contract addresses
- [ ] Handle unsupported chains
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- switchChain() calls wallet provider method
- Managers reinitialize with new chain config
- Contract addresses update correctly
- Native token changes (ETH to BNB)
- Error thrown for unsupported chains
```

**Claude Code Prompt**:
```
Add switchChain() method to FabstirSDKCore.
Write tests FIRST in tests/sdk/chain-switching.test.ts
Must reinitialize all managers with new chain config.
Max 50 new lines in FabstirSDKCore.ts
```

### Sub-phase 3.3: Deposit Account Management
**Goal**: Add deposit account awareness to SDK

**Tasks**:
- [ ] Write tests in `tests/sdk/deposit-account.test.ts` (100 lines)
- [ ] Add getDepositAccount() to FabstirSDKCore
- [ ] Delegate to wallet provider
- [ ] Handle EOA (same as user account)
- [ ] Handle Base Account Kit (primary account)
- [ ] Add error handling
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- getDepositAccount() returns wallet provider value
- EOA returns user account
- Base Account Kit returns primary account
- Error if not authenticated
```

**Claude Code Prompt**:
```
Add getDepositAccount() method to FabstirSDKCore.
Write tests FIRST in tests/sdk/deposit-account.test.ts
Delegates to wallet provider's getDepositAccount().
Max 30 new lines.
```

## Phase 4: Manager Updates

### Sub-phase 4.1: PaymentManager Multi-Chain Core
**Goal**: Update PaymentManager for multi-chain support

**Tasks**:
- [ ] Write tests in `tests/managers/payment-manager-v2.test.ts` (300 lines)
- [ ] Create `packages/sdk-core/src/managers/PaymentManagerV2.ts` (200 lines max)
- [ ] Implement depositNative() for ETH/BNB
- [ ] Implement depositToken() with chain configs
- [ ] Use chain-specific contract addresses
- [ ] Handle token decimals correctly
- [ ] Query deposit account for balances
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- depositNative() works with ETH and BNB
- depositToken() handles chain-specific tokens
- Contract addresses from chain config
- Correct decimals for each token
- getDepositBalance() queries right account
```

**Claude Code Prompt**:
```
Create PaymentManagerV2 with multi-chain support.
Write tests FIRST in tests/managers/payment-manager-v2.test.ts
depositNative() deposits ETH on Base, BNB on opBNB.
Use chain config for contracts and tokens.
Max 200 lines.
```

### Sub-phase 4.2: PaymentManager Deposit Pattern
**Goal**: Implement deposit-then-create session pattern

**Tasks**:
- [ ] Write tests in `tests/managers/deposit-pattern.test.ts` (200 lines)
- [ ] Add createSessionFromDeposit() method
- [ ] Use pre-deposited funds
- [ ] Support native and token deposits
- [ ] Extract sessionId from events
- [ ] Parse transaction receipts
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- createSessionFromDeposit() uses deposit balance
- Works with both native and token deposits
- Correct payment token address used
- Session ID extracted from events
- Transaction receipt properly parsed
```

**Claude Code Prompt**:
```
Add createSessionFromDeposit() to PaymentManagerV2.
Write tests FIRST in tests/managers/deposit-pattern.test.ts
Must work with pre-deposited funds.
Extract sessionId from transaction events.
Max 100 new lines.
```

### Sub-phase 4.3: SessionManager WebSocket Integration
**Goal**: Implement WebSocket connection to host nodes

**Tasks**:
- [ ] Write tests in `tests/managers/session-manager-v2.test.ts` (300 lines)
- [ ] Create `packages/sdk-core/src/managers/SessionManagerV2.ts` (250 lines max)
- [ ] Implement connectToHost() with WebSocket
- [ ] Implement sendPrompt() over WebSocket
- [ ] Handle streaming responses
- [ ] Track connection state
- [ ] Propagate error events
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- connectToHost() establishes WebSocket
- sendPrompt() sends over WebSocket
- Stream chunks handled properly
- Connection state tracked
- Error events propagated
```

**Claude Code Prompt**:
```
Create SessionManagerV2 with WebSocket support.
Write tests FIRST in tests/managers/session-manager-v2.test.ts
Connect directly to host nodes via WebSocket.
Handle streaming responses.
Max 250 lines.
```

### Sub-phase 4.4: Gasless Session Ending
**Goal**: Implement gasless session ending via WebSocket close

**Tasks**:
- [ ] Write tests in `tests/managers/gasless-ending.test.ts` (150 lines)
- [ ] Add endSession() that only closes WebSocket
- [ ] Ensure NO blockchain transaction in endSession()
- [ ] Clear session state on close
- [ ] Add emergencyCompleteSession() as fallback
- [ ] Test WebSocket close code is 1000
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- endSession() just closes WebSocket
- NO blockchain transaction sent
- WebSocket close code is 1000
- Session state cleared
- emergencyCompleteSession() does send transaction
```

**Claude Code Prompt**:
```
Add endSession() to SessionManagerV2 that's GASLESS.
Write tests FIRST in tests/managers/gasless-ending.test.ts
Just close WebSocket, host handles blockchain.
Add emergencyCompleteSession() as fallback.
Max 50 new lines.
CRITICAL: endSession() must NOT call blockchain!
```

## Phase 5: Factory and Integration

### Sub-phase 5.1: Wallet Factory
**Goal**: Factory for creating wallet providers

**Tasks**:
- [ ] Write tests in `tests/factories/wallet-factory.test.ts` (200 lines)
- [ ] Create `packages/sdk-core/src/factories/WalletFactory.ts` (150 lines max)
- [ ] Implement create() static method
- [ ] Implement detectWalletType() method
- [ ] Support EOA and Base Account Kit
- [ ] Handle unsupported wallet types
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- create() returns correct provider type
- EOA requires provider parameter
- Base Account Kit auto-creates
- detectWalletType() identifies wallets
- Unsupported types throw errors
```

**Claude Code Prompt**:
```
Create WalletFactory for provider creation.
Write tests FIRST in tests/factories/wallet-factory.test.ts
Static methods for create() and detectWalletType().
Max 150 lines.
```

### Sub-phase 5.2: Manager Factory Updates
**Goal**: Update manager creation to use wallet providers

**Tasks**:
- [ ] Write tests in `tests/sdk/manager-creation.test.ts` (150 lines)
- [ ] Update manager creation in FabstirSDKCore
- [ ] Pass wallet provider to managers
- [ ] Pass chain config to managers
- [ ] Create custom signer wrapper
- [ ] Reinitialize on chain switch
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- Managers receive wallet provider
- Managers receive chain config
- Managers reinitialize on chain switch
- Custom signer created from provider
- All managers accessible after auth
```

**Claude Code Prompt**:
```
Update manager creation in FabstirSDKCore.
Write tests FIRST in tests/sdk/manager-creation.test.ts
Pass wallet provider and chain config to managers.
Create custom signer wrapper.
Max 50 modified lines.
```

## Phase 6: Testing and Migration

### Sub-phase 6.1: Integration Tests
**Goal**: End-to-end tests for multi-chain/wallet scenarios

**Tasks**:
- [ ] Create `tests/integration/multi-chain-flow.test.ts` (300 lines)
- [ ] Test Base Sepolia with EOA wallet
- [ ] Test opBNB with EOA wallet
- [ ] Test Base Account Kit flow
- [ ] Test chain switching mid-session
- [ ] Test gasless session ending
- [ ] Verify all integration tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- Complete flow on Base Sepolia with EOA
- Complete flow on opBNB with EOA
- Complete flow with Base Account Kit
- Chain switching mid-session
- Gasless session ending
```

**Claude Code Prompt**:
```
Create integration tests for multi-chain/wallet.
Test complete user flows.
Include chain switching.
Verify gasless operations.
Max 300 lines per test file.
```

### Sub-phase 6.2: Backward Compatibility Tests
**Goal**: Ensure old code still works

**Tasks**:
- [ ] Create `tests/compatibility/legacy-sdk.test.ts` (200 lines)
- [ ] Test old authentication with signer
- [ ] Test old payment methods
- [ ] Test old session management
- [ ] Verify no breaking changes
- [ ] Ensure all legacy patterns work

**Test Requirements**:
```typescript
// Tests must verify:
- Old authentication with signer works
- Old payment methods work
- Old session management works
- No breaking changes in API
```

**Claude Code Prompt**:
```
Create backward compatibility tests.
Verify old SDK usage patterns still work.
Test with ethers.Signer authentication.
Max 200 lines.
```

### Sub-phase 6.3: Migration Helpers
**Goal**: Tools to help users migrate

**Tasks**:
- [ ] Write tests in `tests/migration/helpers.test.ts` (150 lines)
- [ ] Create `packages/sdk-core/src/migration/helpers.ts` (100 lines max)
- [ ] Implement signer to provider conversion
- [ ] Add config migration helper
- [ ] Add deprecation warnings
- [ ] Test migration examples
- [ ] Verify all tests pass

**Test Requirements**:
```typescript
// Tests must verify:
- Signer to wallet provider conversion
- Config migration helper
- Deprecation warnings work
- Migration guide examples work
```

**Claude Code Prompt**:
```
Create migration helper utilities.
Write tests FIRST in tests/migration/helpers.test.ts
Convert old configs to new format.
Max 100 lines.
```

## Phase 7: Documentation and Cleanup

### Sub-phase 7.1: API Documentation
**Goal**: Update SDK documentation

**Tasks**:
- [ ] Create `docs/multi-chain-api.md` (500 lines max)
- [ ] Create `docs/migration-guide.md` (300 lines max)
- [ ] Document all wallet types
- [ ] Document chain configurations
- [ ] Explain gasless session ending
- [ ] Add code examples
- [ ] Review for completeness

**Claude Code Prompt**:
```
Create comprehensive API documentation.
Include code examples for each wallet type.
Show multi-chain usage.
Explain gasless session ending.
```

### Sub-phase 7.2: Code Cleanup
**Goal**: Remove deprecated code and optimize

**Tasks**:
- [ ] Create `tests/cleanup.test.ts` (100 lines)
- [ ] Remove hardcoded addresses
- [ ] Remove unused imports
- [ ] Remove console.logs
- [ ] Address all TODOs
- [ ] Run final test suite
- [ ] Verify TypeScript compilation

**Test Requirements**:
```typescript
// Tests must verify:
- No unused imports
- No hardcoded addresses
- No console.logs in production
- All TODOs addressed
```

**Claude Code Prompt**:
```
Clean up SDK code.
Remove hardcoded addresses.
Remove unused imports.
Ensure all tests pass.
```

## Overall Progress Tracking

### Phase Completion Status
- [ ] **Phase 1: Core Abstractions** (3 sub-phases)
  - [ ] Sub-phase 1.1: Wallet Provider Interface
  - [ ] Sub-phase 1.2: Chain Configuration Registry
  - [ ] Sub-phase 1.3: Error Definitions
- [ ] **Phase 2: Wallet Provider Implementations** (3 sub-phases)
  - [ ] Sub-phase 2.1: Base EOA Provider
  - [ ] Sub-phase 2.2: Base Account Kit Provider Core
  - [ ] Sub-phase 2.3: Provider Transaction Handling
- [ ] **Phase 3: SDK Core Updates** (3 sub-phases)
  - [ ] Sub-phase 3.1: SDK Authentication Refactor
  - [ ] Sub-phase 3.2: Chain Switching
  - [ ] Sub-phase 3.3: Deposit Account Management
- [ ] **Phase 4: Manager Updates** (4 sub-phases)
  - [ ] Sub-phase 4.1: PaymentManager Multi-Chain Core
  - [ ] Sub-phase 4.2: PaymentManager Deposit Pattern
  - [ ] Sub-phase 4.3: SessionManager WebSocket Integration
  - [ ] Sub-phase 4.4: Gasless Session Ending
- [ ] **Phase 5: Factory and Integration** (2 sub-phases)
  - [ ] Sub-phase 5.1: Wallet Factory
  - [ ] Sub-phase 5.2: Manager Factory Updates
- [ ] **Phase 6: Testing and Migration** (3 sub-phases)
  - [ ] Sub-phase 6.1: Integration Tests
  - [ ] Sub-phase 6.2: Backward Compatibility Tests
  - [ ] Sub-phase 6.3: Migration Helpers
- [ ] **Phase 7: Documentation and Cleanup** (2 sub-phases)
  - [ ] Sub-phase 7.1: API Documentation
  - [ ] Sub-phase 7.2: Code Cleanup

### Implementation Schedule

#### Week 1: Foundation
- [ ] Days 1-2: Phase 1 (Core Abstractions)
- [ ] Days 3-5: Phase 2 (Wallet Providers)

#### Week 2: Core Updates
- [ ] Days 6-7: Phase 3 (SDK Core)
- [ ] Days 8-10: Phase 4 (Managers)

#### Week 3: Integration
- [ ] Days 11-12: Phase 5 (Factory)
- [ ] Days 13-14: Phase 6 (Testing)
- [ ] Day 15: Phase 7 (Documentation)

## Success Criteria

### Technical Requirements
- [ ] All tests pass (100% of new tests)
- [ ] Backward compatibility maintained
- [ ] No hardcoded addresses
- [ ] Gasless session ending works
- [ ] Multi-chain support verified
- [ ] All TypeScript compilation succeeds
- [ ] No runtime errors in integration tests

### Code Quality
- [ ] Each file within line limits
- [ ] Clear separation of concerns
- [ ] No mock implementations
- [ ] Proper error handling
- [ ] TypeScript strict mode compliance
- [ ] No console.logs in production code
- [ ] All TODOs addressed

### User Experience
- [ ] Chain switching is seamless
- [ ] Wallet detection automatic
- [ ] No gas popups for session ending
- [ ] Clear error messages
- [ ] Migration path documented
- [ ] Examples work out of the box
- [ ] Performance not degraded

## Critical Implementation Notes

### 1. Gasless Session Ending
**MOST IMPORTANT**: The `endSession()` method must ONLY close the WebSocket connection. It must NOT call any blockchain methods. The host node (v5+) automatically calls `completeSessionJob()` when detecting disconnect.

```typescript
// ✅ CORRECT - Gasless
async endSession() {
  this.ws.close(1000, 'User ended session');
  // NO blockchain calls here!
}

// ❌ WRONG - User pays gas
async endSession() {
  await contract.completeSessionJob(sessionId); // NO!
}
```

### 2. Native Token Abstraction
Functions must be chain-agnostic:
- `depositNative()` - deposits ETH on Base, BNB on opBNB
- `withdrawNative()` - withdraws ETH on Base, BNB on opBNB
- Same function names, different behaviors per chain

### 3. Deposit Account Pattern
Different wallet types have different deposit accounts:
- **EOA**: Deposit account = User account
- **Base Account Kit**: Deposit account = Primary account (not sub-account)
- Always use `getDepositAccount()` for deposits

### 4. Chain Configuration
Never hardcode addresses. Always use chain registry:
```typescript
const config = CHAIN_CONFIGS[chainId];
const marketplace = config.contracts.jobMarketplace;
```

### 5. Testing Without Mocks
All tests must use real implementations:
- Real WebSocket connections (can use local server)
- Real contract instances (can use test contracts)
- Real wallet provider implementations
- No jest.mock() or sinon stubs

## Rollback Plan

If issues arise during implementation:

1. **Phase Isolation**: Each phase can be rolled back independently
2. **Feature Flags**: Use environment variables to toggle features
3. **Version Tags**: Tag each successful phase completion
4. **Parallel Development**: Keep v1 and v2 managers side-by-side
5. **Gradual Migration**: Users can opt-in to new features

## Post-Implementation

### Monitoring
- Track chain switching events
- Monitor gasless transaction success rate
- Log wallet type distribution
- Measure session ending patterns

### Optimization
- Cache chain configurations
- Pool WebSocket connections
- Optimize transaction polling
- Reduce bundle size

### Future Enhancements
- Add more chains (Arbitrum, Optimism, etc.)
- Support for Particle/Biconomy wallets
- Advanced session recovery
- Multi-chain aggregation

## Conclusion

This implementation plan provides a systematic approach to upgrading the SDK for multi-chain and multi-wallet support. By following the TDD bounded autonomy approach with strict sub-phases, we ensure:

1. **Quality**: Tests written first ensure correctness
2. **Incrementalism**: Small, manageable changes
3. **Compatibility**: Existing code continues working
4. **Clarity**: Each sub-phase has clear boundaries
5. **Gasless UX**: Users don't pay for session ending

The key innovation is making session ending gasless by leveraging the host node's automatic settlement, eliminating a major UX friction point while maintaining security and proper payment distribution.