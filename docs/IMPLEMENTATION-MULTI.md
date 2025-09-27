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

### Sub-phase 3.2: Smart Account Provider (Base Account Kit)
**Goal**: Implement provider for smart contract wallets with gasless support

**Tasks**:
- [ ] Write tests in `tests/providers/smart-account-provider.test.ts` (250 lines)
- [ ] Create `packages/sdk-core/src/providers/SmartAccountProvider.ts` (200 lines max)
- [ ] Implement gasless transaction support
- [ ] Support deposit account separation
- [ ] Test on Base Sepolia with paymaster

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

### Sub-phase 4.1: Multi-Chain SDK Initialization
**Goal**: Update FabstirSDKCore to support chain selection

**Tasks**:
- [ ] Write tests in `tests/sdk/sdk-multi-chain.test.ts` (200 lines)
- [ ] Update `packages/sdk-core/src/FabstirSDKCore.ts` (add 100 lines max)
- [ ] Add setChain() method
- [ ] Update initialize() to accept chainId
- [ ] Make all managers chain-aware

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
- [ ] Write tests in `tests/factories/wallet-factory.test.ts` (150 lines)
- [ ] Create `packages/sdk-core/src/factories/WalletProviderFactory.ts` (120 lines max)
- [ ] Auto-detect available providers
- [ ] Return appropriate provider instance
- [ ] Handle provider not available errors

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
- [ ] Write tests in `tests/managers/session-manager-multi.test.ts` (200 lines)
- [ ] Update `packages/sdk-core/src/managers/SessionManager.ts` (add 100 lines)
- [ ] Add chainId to all session operations
- [ ] Update WebSocket messages to include chain_id
- [ ] Store chain info in session metadata

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
- [ ] Write tests in `tests/managers/client-manager-multi.test.ts` (150 lines)
- [ ] Update `packages/sdk-core/src/managers/ClientManager.ts` (add 80 lines)
- [ ] Add chain filtering to node discovery
- [ ] Verify nodes support target chain
- [ ] Update health checks with chain validation

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

### Sub-phase 6.1: Multi-Chain Integration Tests
**Goal**: Comprehensive testing across chains

**Tasks**:
- [ ] Write integration tests for Base Sepolia (200 lines)
- [ ] Write integration tests for opBNB testnet (200 lines)
- [ ] Test deposit/withdrawal flows
- [ ] Test chain switching during session
- [ ] Test gasless transactions with smart accounts

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

### Sub-phase 6.2: Backward Compatibility Tests
**Goal**: Ensure existing code continues working

**Tasks**:
- [ ] Test existing single-chain code paths
- [ ] Verify default chain (Base Sepolia) works without changes
- [ ] Test that missing chainId defaults correctly
- [ ] Ensure no breaking changes to public API

## Phase 7: Documentation

### Sub-phase 7.1: API Documentation Updates
**Goal**: Update all documentation for multi-chain support

**Tasks**:
- [ ] Update SDK_API.md with chain parameters
- [ ] Update examples to show chain selection
- [ ] Document deposit/withdrawal pattern
- [ ] Add chain-specific configuration guide
- [ ] Create multi-chain usage examples
- [ ] Document wallet provider selection

### Sub-phase 7.2: Developer Guide
**Goal**: Create comprehensive developer documentation

**Tasks**:
- [ ] Write multi-chain quickstart guide
- [ ] Document wallet provider capabilities
- [ ] Create troubleshooting guide for chain issues
- [ ] Add code examples for each supported chain
- [ ] Document gasless transaction patterns

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

## Notes

- This plan incorporates the latest contract updates (JobMarketplaceWithModels)
- Deposit/withdrawal pattern enables gasless operations
- Chain_id is REQUIRED in all node communications
- Smart accounts provide better UX but aren't required
- Base Sepolia is primary chain, opBNB is secondary

---

*Last Updated: January 2025*
*Based on latest contract deployment and node v5+ requirements*