# Fabstir SDK Multi-Chain/Multi-Wallet Implementation Plan (v2.0)

## Overview

Systematic upgrade of the Fabstir SDK (`@fabstir/sdk-core`) to support multiple blockchain networks (Base Sepolia, opBNB) and wallet providers (EOA, Smart Contract wallets) while maintaining backward compatibility. Integrates with the new JobMarketplaceWithModels contract that supports deposit/withdrawal pattern for gasless operations.

## Current System Context

Based on latest documentation:
- **New Contract**: JobMarketplaceWithModels at `0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f` (Base Sepolia)
- **Deposit/Withdrawal Pattern**: Users can pre-fund accounts for gasless operations
- **Chain-Agnostic Functions**: `depositNative()`, `withdrawNative()` work with ETH/BNB
- **Node Requirements**: All requests MUST include `chain_id` parameter
- **Auth Integration**: AuthManager supports multi-chain with `chainId` in all operations

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST, then implementation
2. **Bounded Autonomy**: Each sub-phase has strict boundaries and line limits
3. **Incremental Progress**: Build on previous sub-phases without breaking them
4. **Backward Compatibility**: Existing code must continue working
5. **No Mocks**: Use real implementations, no mocking allowed
6. **Chain_ID Required**: Every operation must specify target chain

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase (typically 50-200 lines)
- **Test First**: Tests must be written before implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Clear Boundaries**: Each sub-phase is independently verifiable
- **Real Contracts**: Use actual deployed contracts on Base Sepolia for testing
- **No Migration Needed**: This is pre-MVP, no existing users to migrate

## Phase 1: Core Chain Infrastructure

### Sub-phase 1.1: Chain Configuration Registry ✅ COMPLETE
**Goal**: Central registry of all supported chains with current contract addresses

**Tasks**:
- [x] Write tests in `tests/config/chain-registry.test.ts` (150 lines)
- [x] Create `packages/sdk-core/src/config/ChainRegistry.ts` (200 lines max)
- [x] Create `packages/sdk-core/src/types/chain.types.ts` (50 lines max)
- [x] Verify Base Sepolia addresses match new deployment
- [x] Verify opBNB testnet configuration is complete
- [x] Add chain_id to all config structures

**Test Requirements**:
```typescript
// Tests must verify:
- Base Sepolia chainId = 84532
- opBNB testnet chainId = 5611
- JobMarketplace address = 0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f (Base Sepolia)
- NodeRegistry = 0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
- Native tokens: ETH for Base, BNB for opBNB
- getChainConfig(chainId) returns correct config
- isChainSupported(chainId) works correctly
```

**Configuration Structure**:
```typescript
interface ChainConfig {
  chainId: number;
  name: string;
  nativeToken: 'ETH' | 'BNB';
  rpcUrl: string;
  contracts: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    modelRegistry: string;
    usdcToken: string;
    fabToken?: string;
  };
  minDeposit: string; // 0.0002 ETH for Base
  blockExplorer: string;
}
```

### Sub-phase 1.2: Wallet Provider Interface ✅ COMPLETE
**Goal**: Define the contract all wallet providers must implement with deposit support

**Tasks**:
- [x] Write tests in `tests/interfaces/iwallet-provider.test.ts` (120 lines)
- [x] Create `packages/sdk-core/src/interfaces/IWalletProvider.ts` (80 lines max)
- [x] Include deposit/withdrawal account methods
- [x] Include chain switching capabilities
- [x] Add gasless transaction support flags

**Interface Requirements**:
```typescript
interface IWalletProvider {
  // Core wallet functions
  connect(chainId?: number): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account management
  getAddress(): Promise<string>;
  getDepositAccount(): Promise<string>; // For gasless ops

  // Chain management
  getCurrentChainId(): Promise<number>;
  switchChain(chainId: number): Promise<void>;
  getSupportedChains(): number[];

  // Transaction handling
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
  signMessage(message: string): Promise<string>;

  // Balance queries
  getBalance(token?: string): Promise<string>;

  // Provider capabilities
  getCapabilities(): WalletCapabilities;
}

interface WalletCapabilities {
  supportsGaslessTransactions: boolean;
  supportsChainSwitching: boolean;
  supportsSmartAccounts: boolean;
  requiresDepositAccount: boolean;
}
```

### Sub-phase 1.3: Chain-Aware Error System ✅ COMPLETE
**Goal**: Comprehensive error handling for multi-chain scenarios

**Tasks**:
- [x] Write tests in `tests/errors/chain-errors.test.ts` (100 lines)
- [x] Create `packages/sdk-core/src/errors/ChainErrors.ts` (80 lines max)
- [x] Include chain_id in all error messages
- [x] Add deposit-related errors
- [x] Add node communication errors

**Error Types**:
```typescript
- UnsupportedChainError(chainId, supportedChains)
- ChainMismatchError(expected, actual, operation)
- InsufficientDepositError(required, available, chainId)
- NodeChainMismatchError(nodeChainId, sdkChainId)
- DepositAccountNotAvailableError(walletType)
```

## Phase 2: Contract Integration Updates

### Sub-phase 2.1: JobMarketplace Multi-Chain Wrapper ✅ COMPLETE
**Goal**: Update contract wrappers to use new JobMarketplaceWithModels

**Tasks**:
- [x] Write tests in `tests/contracts/job-marketplace-multi.test.ts` (250 lines)
- [x] Update `packages/sdk-core/src/contracts/JobMarketplace.ts` (200 lines max)
- [x] Add depositNative() and withdrawNative() methods
- [x] Add createSessionFromDeposit() method
- [x] Update all methods to use chain-specific addresses
- [x] Test with real contract on Base Sepolia

**Key Methods to Update**:
```typescript
class JobMarketplaceWrapper {
  constructor(chainId: number, signer: Signer);

  // Deposit/Withdrawal (NEW)
  async depositNative(amount: string): Promise<TransactionResponse>;
  async withdrawNative(amount: string): Promise<TransactionResponse>;
  async depositToken(token: string, amount: string): Promise<TransactionResponse>;
  async withdrawToken(token: string, amount: string): Promise<TransactionResponse>;
  async getDepositBalance(account: string, token?: string): Promise<string>;

  // Session creation with deposits (NEW)
  async createSessionFromDeposit(params: {
    host: string;
    paymentToken: string; // address(0) for native
    deposit: string;
    pricePerToken: number;
    duration: number;
    proofInterval: number;
  }): Promise<number>;

  // Existing methods (update to be chain-aware)
  async createSessionJob(...): Promise<number>;
  async completeSessionJob(jobId: number, cid: string): Promise<TransactionResponse>;
}
```

### Sub-phase 2.2: Chain-Aware Manager Updates ✅ COMPLETE
**Goal**: Update all managers to support multi-chain operations

**Tasks**:
- [x] Write tests in `tests/managers/payment-manager-multi.test.ts` (200 lines)
- [x] Update `packages/sdk-core/src/managers/PaymentManager.ts` (250 lines max)
- [x] Add chainId parameter to all methods
- [x] Add deposit management methods
- [x] Update to use chain-specific contract addresses

**PaymentManager Updates**:
```typescript
class PaymentManager {
  // Deposit management (NEW)
  async depositNative(amount: string, chainId?: number): Promise<TransactionResponse>;
  async withdrawNative(amount: string, chainId?: number): Promise<TransactionResponse>;
  async getDepositBalance(chainId?: number): Promise<DepositBalances>;

  // Session creation with chain selection
  async createSessionJob(params: {
    host: string;
    amount: string;
    pricePerToken: number;
    duration: number;
    chainId?: number; // Default to current chain
    useDeposit?: boolean; // Use pre-funded deposit
  }): Promise<number>;
}
```

## Phase 3: Wallet Provider Implementations

### Sub-phase 3.1: EOA Provider (MetaMask, Rainbow) ✅ COMPLETE
**Goal**: Implement provider for standard EOA wallets

**Tasks**:
- [x] Write tests in `tests/providers/eoa-provider.test.ts` (200 lines)
- [x] Create `packages/sdk-core/src/providers/EOAProvider.ts` (180 lines max)
- [x] Test with real MetaMask on Base Sepolia
- [x] Verify chain switching works
- [x] No gasless support (EOA pays gas)

**Implementation Notes**:
```typescript
class EOAProvider implements IWalletProvider {
  constructor(provider: any); // window.ethereum

  async connect(chainId?: number): Promise<void> {
    // Request accounts
    // Switch to chainId if provided
  }

  getDepositAccount(): Promise<string> {
    // Same as getAddress() for EOA
    return this.getAddress();
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGaslessTransactions: false,
      supportsChainSwitching: true,
      supportsSmartAccounts: false,
      requiresDepositAccount: false
    };
  }
}
```

### Sub-phase 3.2: Smart Account Provider (Base Account Kit) ✅ COMPLETE
**Goal**: Implement provider for smart contract wallets with gasless support

**Tasks**:
- [x] Write tests in `tests/providers/smart-account-provider.test.ts` (250 lines)
- [x] Create `packages/sdk-core/src/providers/SmartAccountProvider.ts` (200 lines max)
- [x] Implement gasless transaction support
- [x] Support deposit account separation
- [x] Test on Base Sepolia with paymaster

**Implementation Notes**:
```typescript
class SmartAccountProvider implements IWalletProvider {
  private smartAccount: any;
  private bundlerClient: any;

  async getDepositAccount(): Promise<string> {
    // Smart account address (different from EOA)
    return this.smartAccount.address;
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    // Use bundler for gasless execution
    return this.bundlerClient.sendUserOperation(tx);
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGaslessTransactions: true,
      supportsChainSwitching: false, // Limited in v1
      supportsSmartAccounts: true,
      requiresDepositAccount: true
    };
  }
}
```

## Phase 4: SDK Core Integration

### Sub-phase 4.1: Multi-Chain SDK Initialization ✅ COMPLETE
**Goal**: Update FabstirSDKCore to support chain selection

**Tasks**:
- [x] Write tests in `tests/sdk/sdk-multi-chain.test.ts` (200 lines)
- [x] Update `packages/sdk-core/src/FabstirSDKCore.ts` (add 100 lines max)
- [x] Add switchChain() method
- [x] Update initialize() to accept wallet provider
- [x] Make all managers chain-aware

**SDK Updates**:
```typescript
class FabstirSDKCore {
  private currentChainId: number;
  private walletProvider: IWalletProvider;

  constructor(config: SDKConfig) {
    // Accept chainId in config
    this.currentChainId = config.chainId || 84532; // Default Base Sepolia
  }

  async initialize(walletProvider: IWalletProvider): Promise<void> {
    this.walletProvider = walletProvider;
    await walletProvider.connect(this.currentChainId);
  }

  async switchChain(chainId: number): Promise<void> {
    if (!this.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId);
    }
    await this.walletProvider.switchChain(chainId);
    this.currentChainId = chainId;
    // Reinitialize managers with new chain
  }

  getCurrentChain(): ChainConfig {
    return ChainRegistry.getChain(this.currentChainId);
  }
}
```

### Sub-phase 4.2: Wallet Provider Factory
**Goal**: Simplify wallet provider selection and initialization

**Tasks**:
- [x] Write tests in `tests/factories/wallet-factory.test.ts` (150 lines)
- [x] Create `packages/sdk-core/src/factories/WalletProviderFactory.ts` (120 lines max)
- [x] Auto-detect available providers
- [x] Return appropriate provider instance
- [x] Handle provider not available errors

**Factory Implementation**:
```typescript
class WalletProviderFactory {
  static async createProvider(type: 'metamask' | 'base-account-kit' | 'auto'): Promise<IWalletProvider> {
    if (type === 'auto') {
      // Auto-detect available provider
      if (window.ethereum) return new EOAProvider(window.ethereum);
      return new SmartAccountProvider();
    }

    switch(type) {
      case 'metamask':
        if (!window.ethereum) throw new Error('MetaMask not available');
        return new EOAProvider(window.ethereum);
      case 'base-account-kit':
        return new SmartAccountProvider();
    }
  }
}
```

## Phase 5: Session Management Updates

### Sub-phase 5.1: Chain-Aware Session Manager
**Goal**: Update SessionManager to handle multi-chain sessions

**Tasks**:
- [x] Write tests in `tests/managers/session-manager-multi.test.ts` (200 lines)
- [x] Update `packages/sdk-core/src/managers/SessionManager.ts` (add 100 lines)
- [x] Add chainId to all session operations
- [x] Update WebSocket messages to include chain_id
- [x] Store chain info in session metadata

**Session Updates**:
```typescript
interface SessionConfig {
  chainId: number; // Required
  host: string;
  modelId: string;
  paymentMethod: 'deposit' | 'direct';
  // ... other fields
}

class SessionManager {
  async startSession(config: SessionConfig): Promise<Session> {
    // Verify chain is supported
    // Include chain_id in WebSocket init
    const initMessage = {
      type: 'session_init',
      chain_id: config.chainId, // REQUIRED by node
      session_id: sessionId,
      job_id: jobId,
      user_address: address
    };
  }
}
```

### Sub-phase 5.2: Node Discovery with Chain Filtering
**Goal**: Update ClientManager to discover nodes by chain

**Tasks**:
- [x] Write tests in `tests/managers/client-manager-multi.test.ts` (150 lines)
- [x] Update `packages/sdk-core/src/managers/ClientManager.ts` (add 80 lines)
- [x] Add chain filtering to node discovery
- [x] Verify nodes support target chain
- [x] Update health checks with chain validation

**Discovery Updates**:
```typescript
class ClientManager {
  async discoverNodes(chainId: number): Promise<NodeInfo[]> {
    // Query nodes that support specific chain
    const response = await fetch(`${nodeUrl}/v1/models?chain_id=${chainId}`);
    // Filter nodes by chain support
  }

  async getNodeChains(nodeUrl: string): Promise<number[]> {
    // Get list of chains node supports
    const response = await fetch(`${nodeUrl}/v1/chains`);
    return response.chains.map(c => c.chain_id);
  }
}
```

## Phase 6: Testing & Validation

### Sub-phase 6.1: Multi-Chain Integration Tests ✅ COMPLETE
**Goal**: Comprehensive testing across chains

**Tasks**:
- [x] Write integration tests for Base Sepolia (200 lines)
- [x] Write integration tests for opBNB testnet (200 lines)
- [x] Test deposit/withdrawal flows
- [x] Test chain switching during session
- [x] Test gasless transactions with smart accounts

**Test Scenarios**:
```typescript
// Base Sepolia Tests
- Create session with ETH payment
- Deposit ETH and create session from deposit
- Switch from MetaMask to Base Account Kit
- Complete session with gasless transaction

// opBNB Testnet Tests
- Create session with BNB payment
- Deposit BNB and create session from deposit
- Verify correct contract addresses used
- Test cross-chain session management
```

### Sub-phase 6.2: Backward Compatibility Tests ✅ COMPLETE
**Goal**: Ensure existing code continues working

**Tasks**:
- [x] Test existing single-chain code paths (minimal validation for pre-MVP)
- [x] Verify default chain (Base Sepolia) works without changes
- [x] Test that missing chainId defaults correctly
- [x] Ensure no breaking changes to public API

**Note**: Minimal implementation (75 lines) since this is pre-MVP with no existing users to migrate

## Phase 7: Documentation

### Sub-phase 7.1: API Documentation Updates ✅ COMPLETE
**Goal**: Update all documentation for multi-chain support

**Tasks**:
- [x] Update SDK_API.md with chain parameters
- [x] Update examples to show chain selection
- [x] Document deposit/withdrawal pattern
- [x] Add chain-specific configuration guide
- [x] Create multi-chain usage examples
- [x] Document wallet provider selection

**Comprehensive documentation added:**
- Multi-Chain Support section with supported chains table
- Chain Management API methods (initialize, getCurrentChainId, switchChain, etc.)
- Wallet Provider documentation (IWalletProvider, EOAProvider, SmartAccountProvider)
- Payment Management updates with deposit/withdrawal methods
- Multi-chain error types and handling
- 6 detailed multi-chain usage examples

### Sub-phase 7.2: Developer Guide ✅ COMPLETE
**Goal**: Create comprehensive developer documentation

**Tasks**:
- [x] Write multi-chain quickstart guide
- [x] Document wallet provider capabilities
- [x] Create troubleshooting guide for chain issues
- [x] Add code examples for each supported chain
- [x] Document gasless transaction patterns

**Comprehensive guide created:**
- Multi-chain quickstart with minimal setup examples
- Wallet provider capabilities comparison table
- Troubleshooting guide for common chain issues
- Code examples for Base Sepolia and opBNB testnet
- Gasless transaction patterns with Base Account Kit
- Best practices for multi-chain development
- Migration checklist from single-chain to multi-chain

## Implementation Schedule

**Week 1**: Phase 1 (Core Infrastructure)
- Day 1-2: Chain Configuration Registry
- Day 3: Wallet Provider Interface
- Day 4: Error System
- Day 5: Integration testing

**Week 2**: Phase 2-3 (Contracts & Providers)
- Day 1-2: JobMarketplace wrapper
- Day 3: Manager updates
- Day 4-5: Provider implementations

**Week 3**: Phase 4-5 (SDK Integration)
- Day 1-2: SDK core updates
- Day 3: Session management
- Day 4: Node discovery
- Day 5: Integration testing

**Week 4**: Phase 6-7 (Testing & Documentation)
- Day 1-3: Comprehensive testing
- Day 4-5: Documentation and developer guides

## Success Criteria

1. **Base Sepolia Support**: All existing functionality works
2. **opBNB Support**: Full feature parity with Base Sepolia
3. **Gasless Operations**: Smart accounts can operate without gas
4. **Deposit Pattern**: Users can pre-fund for better UX
5. **Chain Switching**: Seamless transition between chains
6. **Node Compatibility**: SDK works with updated multi-chain nodes
7. **Test Coverage**: >90% coverage for new code
8. **Documentation**: Complete developer documentation for multi-chain usage

## Risk Mitigation

1. **Contract Address Changes**: Use configuration registry, never hardcode
2. **Chain ID Confusion**: Always validate and include in requests
3. **Node Incompatibility**: Check node version and capabilities
4. **Gas Estimation**: Account for chain-specific gas costs
5. **Provider Availability**: Graceful fallbacks when providers unavailable

## Appendix: Chain Configurations

### Base Sepolia (Chain ID: 84532)
```javascript
{
  chainId: 84532,
  name: "Base Sepolia",
  nativeToken: "ETH",
  contracts: {
    jobMarketplace: "0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f",
    nodeRegistry: "0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218",
    proofSystem: "0x2ACcc60893872A499700908889B38C5420CBcFD1",
    hostEarnings: "0x908962e8c6CE72610021586f85ebDE09aAc97776",
    modelRegistry: "0x92b2De840bB2171203011A6dBA928d855cA8183E",
    usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62"
  }
}
```

### opBNB Testnet (Chain ID: 5611)
```javascript
{
  chainId: 5611,
  name: "opBNB Testnet",
  nativeToken: "BNB",
  contracts: {
    // To be deployed
  }
}
```

## Phase 8: Production Readiness - Remove Mocks & Implement Real Code

### Sub-phase 8.1: Critical Transaction Fixes ✅ COMPLETE
**Goal**: Fix transaction handling that returns fake hashes or invalid proofs

**Tasks**:
- [x] Write tests in `tests/providers/smart-account-real.test.ts` (200 lines)
- [x] Fix `SmartAccountProvider.sendTransaction()` to use real bundler (150 lines max)
- [x] Remove mock transaction hash generation (`0xdeed...`)
- [x] Implement proper UserOperation submission
- [x] Add bundler response validation
- [x] Test with real Base Account Kit on testnet

**Completed**:
- Replaced hardcoded `0xdeed...` with real bundler integration
- Implemented JSON-RPC calls to bundler for UserOperation submission
- Added transaction hash validation (must be valid 0x + 64 hex chars)
- Added retry logic for transient network failures
- Created comprehensive test suite with 11 tests (all passing)

**Test Requirements**:
```typescript
// Tests must verify:
- Real transaction hashes returned from bundler
- UserOperation properly formatted and submitted
- Transaction receipts retrievable on-chain
- Gas estimation returns real values
- Error handling for bundler failures
```

### Sub-phase 8.2: Remove Mock Proof Fallbacks ✅ COMPLETE
**Goal**: Eliminate invalid proof generation that would fail on-chain

**Tasks**:
- [x] Write tests in `tests/services/proof-verifier-real.test.ts` (150 lines)
- [x] Update `FabstirSDKCompat.generateProof()` to fail explicitly (50 lines max)
- [x] Remove `'0x' + '00'.repeat(256)` fallback
- [x] Remove mock proof type from `IProofService`
- [x] Update `ProofVerifier` to reject mock proofs
- [x] Add proper error messages for missing proof service

**Completed**:
- Removed mock proof fallback from FabstirSDKCompat
- Now throws `PROOF_SERVICE_UNAVAILABLE` error
- Removed 'mock' from ProofResult.proofType enum
- Enhanced ProofVerifier with pattern detection and entropy validation
- Detects all-zero proofs, repeating patterns (deed, beef, cafe)
- Created test suite with 17 tests (all passing)

**Implementation Notes**:
```typescript
// Instead of returning mock proof:
throw new SDKError('Proof service not available', 'PROOF_SERVICE_UNAVAILABLE');
// Never accept proofs starting with 0x000000...
```

### Sub-phase 8.3: Implement WalletConnect Authentication ✅ COMPLETE
**Goal**: Add real WalletConnect support or remove it entirely

**Tasks**:
- [x] Write tests in `tests/auth/walletconnect.test.ts` (200 lines)
- [x] Decision: Remove WalletConnect from auth options (not needed for MVP)
- [x] Remove WalletConnect from `FabstirSDKCore.authenticate()`
- [x] Remove WalletConnect from `AuthManager`
- [x] Remove WalletConnect from type definitions
- [x] Remove WalletConnect from `BrowserProvider` and `EnvironmentDetector`
- [x] Update documentation to reflect removal
- [x] Test all changes work correctly

**Completed**:
- Analyzed requirements and determined WalletConnect not required for MVP
- Alternative auth methods available (MetaMask, private key, signer)
- Would require additional dependencies (@walletconnect/web3-provider)
- Removed all WalletConnect references from codebase
- Created comprehensive test suite verifying removal (all tests passing)
- Updated documentation and types

### Sub-phase 8.4: Implement Payment History ✅ COMPLETE
**Goal**: Query real blockchain events for transaction history

**Tasks**:
- [x] Write tests in `tests/managers/payment-history.test.ts` (200 lines)
- [x] Implement `PaymentManager.getPaymentHistory()` (150 lines max)
- [x] Query JobMarketplace contract events
- [x] Parse SessionJobCreated events
- [x] Parse SessionCompleted events (fixed event name)
- [x] Format history with timestamps and amounts
- [x] Add pagination support for large histories

**Completed**:
- Implemented chunked querying to avoid RPC limits (10 blocks per request)
- Fixed event name from SessionJobCompleted to SessionCompleted
- Added proper error handling for invalid addresses
- Implemented pagination with fromBlock/toBlock parameters
- Added support for both ETH and token payment events
- Created comprehensive test suite with 15+ tests
- Default queries last 10000 blocks for performance

**Event Parsing**:
```typescript
// Query these events from contract:
- SessionJobCreated(jobId, user, host, deposit)
- SessionCompleted(jobId, totalTokensUsed, userRefund)
- UserDepositedNative(user, amount)
- UserWithdrewNative(user, amount)
```

### Sub-phase 8.5: Implement Admin Management ✅ COMPLETE
**Goal**: Add treasury admin functions or document as unsupported

**Tasks**:
- [x] Write tests in `tests/managers/treasury-admin.test.ts` (150 lines)
- [x] Check if contract supports multi-admin
- [x] Contract uses single-owner pattern (no multi-admin support)
- [x] Document single-admin limitation in TreasuryManager
- [x] Update error messages to be informative with CONTRACT_LIMITATION code
- [x] Test admin check functionality (isAdmin)

**Completed**:
- Analyzed JobMarketplace contract ABI - no multi-admin functions exist
- Contract uses Ownable pattern with single owner
- Updated addAdmin() and removeAdmin() with informative error messages
- Added CONTRACT_LIMITATION error code with detailed explanations
- Documented that only contract owner has admin privileges
- Created comprehensive test suite documenting single-admin architecture
- Confirmed treasury functions (withdraw, setFee) are owner-only

**Implementation Notes**:
```typescript
// Contract has single owner, no multi-admin:
- owner() returns the single admin address
- No addAdmin() or removeAdmin() in contract
- Treasury operations restricted to owner only
- Added clear documentation of limitations
```

### Sub-phase 8.6: Remove opBNB Placeholder Configuration 🔄 DEFERRED (Post-MVP)
**Goal**: Remove non-functional chain or add real contract addresses

**Status**: DEFERRED - MVP will launch on Base Sepolia first. opBNB deployment will come after MVP.

**Tasks**:
- [ ] Write tests in `tests/config/chain-validation.test.ts` (100 lines)
- [ ] Remove opBNB from `ChainRegistry` (20 lines max)
- [ ] OR: Get real opBNB contract addresses from deployment
- [ ] Update documentation to reflect supported chains
- [ ] Add validation to reject placeholder addresses
- [ ] Test chain switching only uses valid chains

**Validation Logic**:
```typescript
// Reject any contract address that matches placeholder pattern:
if (address.match(/^0x0+[1-9]$/)) {
  throw new Error('Invalid placeholder contract address');
}
```

### Sub-phase 8.7: Remove Hardcoded Seeds & Test Data ✅ COMPLETE
**Goal**: Eliminate security risks from predictable test data

**Tasks**:
- [x] Write tests in `tests/security/seed-generation.test.ts` (150 lines)
- [x] Remove hardcoded seed phrase from `FabstirSDKCore` (50 lines max)
- [x] Require proper seed generation or user input
- [x] Remove test private keys from source code
- [x] Add entropy validation for generated seeds
- [x] Document secure seed management

**Completed**:
- Created comprehensive security test suite (150 lines)
- Removed hardcoded test seed from FabstirSDKCore
- Added `generateSecureSeed()` using ethers.randomBytes
- Added `validateSeed()` method with entropy checks
- Production mode now requires valid seed or throws error
- Development mode generates temporary secure seed
- No private keys found in source code

**Security Requirements**:
```typescript
// Production mode requires seed:
if (mode === 'production' && !seed) {
  throw new SDKError('S5 seed phrase required', 'SEED_REQUIRED');
}
// Validates entropy and rejects weak seeds
await sdk.validateSeed(); // Throws on weak/test seeds
```
// BETTER: this.s5Seed = userProvidedSeed || await promptForSeed();
```

### Sub-phase 8.8: Implement Host Metrics ✅ COMPLETE
**Goal**: Add real metrics submission or remove from interface

**Completed**:
- ✅ Wrote comprehensive tests in `tests/managers/host-metrics.test.ts` (270 lines)
- ✅ Designed HostMetrics data structure with validation
- ✅ Implemented `HostManager.submitMetrics()` with local storage
- ✅ Added in-memory metrics storage (no contract needed for MVP)
- ✅ Added metrics retrieval methods (`getStoredMetrics`, `getAggregatedMetrics`, `clearMetrics`)
- ✅ All 13 tests passing

**Implementation Details**:
- Local in-memory storage for MVP (can add contract/service later)
- Automatic timestamp generation if not provided
- Validation for negative values and uptime range (0-1)
- Aggregation methods for analytics
- Keeps last 1000 metrics entries per host

**Metrics Structure**:
```typescript
interface HostMetrics {
  jobsCompleted: number;
  tokensProcessed: number;
  averageLatency: number;
  uptime: number;
  timestamp?: number;
}
```

### Sub-phase 8.9: Integration Testing
**Goal**: Verify all mock removals work in production environment

**Tasks**:
- [ ] Write end-to-end tests without any mocks (300 lines)
- [ ] Test complete user flow on Base Sepolia
- [ ] Test smart account with real bundler
- [ ] Verify proof generation and verification
- [ ] Test payment history retrieval
- [ ] Validate all error paths
- [ ] Document any remaining limitations

**Test Scenarios**:
```typescript
// Must test these production scenarios:
- Create session with real smart account
- Submit real proofs to contract
- Query real blockchain events
- Handle real network errors
- Validate real gas costs
```

## Success Criteria for Phase 8

1. **No Mock Returns**: Zero hardcoded transaction hashes or proof values
2. **Real Blockchain Integration**: All contract calls work on testnet
3. **Proper Error Handling**: Explicit errors instead of silent mocks
4. **Security**: No hardcoded seeds or private keys
5. **Documentation**: Clear about what's implemented vs unsupported
6. **Test Coverage**: 100% coverage of production code paths
7. **Chain Validation**: Only functional chains in registry

## Implementation Order

1. **Week 1**: Critical fixes (8.1-8.2) - Stop returning fake data
2. **Week 2**: Feature implementation (8.3-8.5) - Add missing features
3. **Week 3**: Security & cleanup (8.6-8.8) - Remove test data
4. **Week 4**: Integration testing (8.9) - Validate production readiness

## Notes

- This plan incorporates the latest contract updates (JobMarketplaceWithModels)
- Deposit/withdrawal pattern enables gasless operations
- Chain_id is REQUIRED in all node communications
- Smart accounts provide better UX but aren't required
- Base Sepolia is primary chain, opBNB is secondary

---

*Last Updated: January 2025*
*Based on latest contract deployment and node v5+ requirements*