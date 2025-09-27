# Fabstir SDK Multi-Chain Developer Guide

## Table of Contents
- [Quick Start](#quick-start)
- [Supported Chains](#supported-chains)
- [Wallet Provider Capabilities](#wallet-provider-capabilities)
- [Chain-Specific Examples](#chain-specific-examples)
- [Gasless Transactions](#gasless-transactions)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Migration Checklist](#migration-checklist)

## Quick Start

### 1. Installation

```bash
# For browser/React applications
npm install @fabstir/sdk-core

# For Node.js applications
npm install @fabstir/sdk-core @fabstir/sdk-node
```

### 2. Basic Multi-Chain Setup

```typescript
import { FabstirSDKCore, EOAProvider, ChainId } from '@fabstir/sdk-core';

// Step 1: Initialize SDK with a specific chain
const sdk = new FabstirSDKCore({
  rpcUrl: 'https://sepolia.base.org',
  chainId: ChainId.BASE_SEPOLIA, // 84532
  contractAddresses: {
    jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
    nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
    proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
    hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
    modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
  }
});

// Step 2: Initialize with a wallet provider
const provider = new EOAProvider(window.ethereum);
await sdk.initialize(provider);

// Step 3: Authenticate
await sdk.authenticate('privatekey', {
  privateKey: process.env.PRIVATE_KEY
});

// Step 4: You're ready to use the SDK!
const currentChain = sdk.getCurrentChain();
console.log(`Connected to ${currentChain.name} (${currentChain.chainId})`);
```

### 3. Quick Chain Switch

```typescript
// Check current chain
console.log('Current chain:', sdk.getCurrentChainId()); // 84532

// Switch to opBNB testnet
await sdk.switchChain(ChainId.OPBNB_TESTNET); // 5611

// Verify switch
console.log('New chain:', sdk.getCurrentChain().name); // "opBNB Testnet"
```

## Supported Chains

### Base Sepolia (Chain ID: 84532)

**Network Details:**
- **Chain ID:** 84532
- **Native Token:** ETH
- **RPC URL:** https://sepolia.base.org
- **Block Explorer:** https://sepolia.basescan.org
- **Minimum Deposit:** 0.0002 ETH
- **Status:** Production Ready

**Contract Addresses:**
```typescript
const BASE_SEPOLIA_CONTRACTS = {
  jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
  nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
  proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
  hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
  usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
  modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
};
```

### opBNB Testnet (Chain ID: 5611)

**Network Details:**
- **Chain ID:** 5611
- **Native Token:** BNB
- **RPC URL:** https://opbnb-testnet-rpc.bnbchain.org
- **Block Explorer:** https://testnet.opbnbscan.com
- **Minimum Deposit:** 0.001 BNB
- **Status:** Development/Testing

**Contract Addresses:**
```typescript
const OPBNB_TESTNET_CONTRACTS = {
  // Note: These are placeholder addresses for development
  jobMarketplace: '0x0000000000000000000000000000000000000001',
  nodeRegistry: '0x0000000000000000000000000000000000000002',
  proofSystem: '0x0000000000000000000000000000000000000003',
  hostEarnings: '0x0000000000000000000000000000000000000004',
  modelRegistry: '0x0000000000000000000000000000000000000005',
  usdcToken: '0x0000000000000000000000000000000000000006',
  fabToken: '0x0000000000000000000000000000000000000007'
};
```

## Wallet Provider Capabilities

### EOAProvider (MetaMask, Rainbow, etc.)

**Capabilities:**
- ✅ Standard transaction signing
- ✅ Chain switching support
- ✅ Multiple chain support
- ❌ Gasless transactions
- ❌ Smart account features

**When to Use:**
- Traditional Web3 applications
- Users comfortable with gas fees
- Simple transaction flows
- Development and testing

**Example Setup:**
```typescript
import { EOAProvider } from '@fabstir/sdk-core';

// For browser extension wallets
const provider = new EOAProvider(window.ethereum);

// Connect to specific chain
await provider.connect(ChainId.BASE_SEPOLIA);

// Check capabilities
const capabilities = provider.getCapabilities();
console.log('Supports gasless:', capabilities.supportsGaslessTransactions); // false
console.log('Can switch chains:', capabilities.supportsChainSwitching); // true
```

### SmartAccountProvider (Base Account Kit)

**Capabilities:**
- ✅ Gasless transactions (with paymaster)
- ✅ Batch transactions
- ✅ Social recovery options
- ✅ Session keys
- ⚠️ Limited chain switching (per implementation)
- ✅ Smart contract wallet features

**When to Use:**
- User-friendly dApps
- Gasless transaction requirements
- Batch operations needed
- Enhanced security features required

**Example Setup:**
```typescript
import { SmartAccountProvider } from '@fabstir/sdk-core';

const provider = new SmartAccountProvider({
  bundlerUrl: 'https://bundler.base.org',
  paymasterUrl: 'https://paymaster.base.org',
  chainId: ChainId.BASE_SEPOLIA
});

await provider.connect();

// Get deposit account (different from EOA)
const depositAccount = await provider.getDepositAccount();
console.log('Smart account address:', depositAccount);

// Check capabilities
const capabilities = provider.getCapabilities();
console.log('Supports gasless:', capabilities.supportsGaslessTransactions); // true
console.log('Requires deposit account:', capabilities.requiresDepositAccount); // true
```

### Choosing the Right Provider

| Use Case | Recommended Provider | Reason |
|----------|---------------------|---------|
| Development/Testing | EOAProvider | Simple, direct control |
| User Onboarding | SmartAccountProvider | No gas fees, better UX |
| Power Users | EOAProvider | Full control, multi-chain |
| Mobile Apps | SmartAccountProvider | Better mobile UX |
| Cross-chain Operations | EOAProvider | Better chain switching |

## Chain-Specific Examples

### Base Sepolia Example - ETH Session

```typescript
// Initialize for Base Sepolia
const sdk = new FabstirSDKCore({
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: 'https://sepolia.base.org',
  contractAddresses: BASE_SEPOLIA_CONTRACTS
});

// Initialize with MetaMask
const provider = new EOAProvider(window.ethereum);
await sdk.initialize(provider);
await sdk.authenticate('privatekey', { privateKey: privateKey });

// Deposit ETH for sessions
const paymentManager = sdk.getPaymentManager();
const depositTx = await paymentManager.depositNative("0.001"); // 0.001 ETH
await depositTx.wait(3);

// Create ETH-funded session
const sessionManager = sdk.getSessionManager();
const session = await sessionManager.startSession(
  modelId,
  hostAddress,
  {
    depositAmount: "0.0005", // ETH amount
    pricePerToken: 200,
    duration: 3600,
    proofInterval: 100
  }
);

// Send prompts
const response = await sessionManager.sendPromptStreaming(
  session.sessionId,
  "What is Ethereum?",
  (chunk) => console.log('Streaming:', chunk)
);
```

### opBNB Testnet Example - BNB Session

```typescript
// Initialize for opBNB
const sdk = new FabstirSDKCore({
  chainId: ChainId.OPBNB_TESTNET,
  rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
  contractAddresses: OPBNB_TESTNET_CONTRACTS
});

// Initialize and authenticate
const provider = new EOAProvider(window.ethereum);
await sdk.initialize(provider);
await sdk.authenticate('privatekey', { privateKey: privateKey });

// Deposit BNB (higher minimum than ETH)
const paymentManager = sdk.getPaymentManager();
const depositTx = await paymentManager.depositNative("0.002"); // 0.002 BNB
await depositTx.wait(3);

// Create BNB-funded session
const sessionManager = sdk.getSessionManager();
const session = await sessionManager.startSession(
  modelId,
  hostAddress,
  {
    depositAmount: "0.001", // BNB amount
    pricePerToken: 200,
    duration: 3600,
    proofInterval: 100
  }
);
```

### Cross-Chain Session Management

```typescript
class MultiChainSessionManager {
  private sdk: FabstirSDKCore;
  private sessions: Map<number, bigint> = new Map();

  async createSessionOnChain(
    chainId: number,
    modelId: string,
    hostAddress: string,
    depositAmount: string
  ) {
    // Switch to target chain
    await this.sdk.switchChain(chainId);

    // Get chain-specific configuration
    const chain = this.sdk.getCurrentChain();
    console.log(`Creating session on ${chain.name}`);

    // Verify minimum deposit
    if (parseFloat(depositAmount) < parseFloat(chain.minDeposit)) {
      throw new Error(`Deposit below minimum: ${chain.minDeposit} ${chain.nativeToken}`);
    }

    // Create session
    const sessionManager = this.sdk.getSessionManager();
    const session = await sessionManager.startSession(
      modelId,
      hostAddress,
      {
        depositAmount,
        pricePerToken: 200,
        duration: 3600,
        proofInterval: 100
      }
    );

    // Store session ID for this chain
    this.sessions.set(chainId, session.sessionId);

    return session;
  }

  async resumeSessionOnChain(chainId: number) {
    const sessionId = this.sessions.get(chainId);
    if (!sessionId) {
      throw new Error(`No session found for chain ${chainId}`);
    }

    await this.sdk.switchChain(chainId);
    const sessionManager = this.sdk.getSessionManager();
    return await sessionManager.resumeSession(sessionId);
  }
}
```

## Gasless Transactions

### Setting Up Gasless Transactions with Base Account Kit

```typescript
import { createBaseAccountSDK } from '@base-org/account';
import { SmartAccountProvider } from '@fabstir/sdk-core';

// Step 1: Create Base Account SDK
const baseAccountSDK = await createBaseAccountSDK({
  chainId: 84532, // Base Sepolia
  jsonRpcUrl: process.env.RPC_URL,
  bundlerUrl: process.env.BUNDLER_URL,
  paymasterUrl: process.env.PAYMASTER_URL
});

// Step 2: Create sub-account for auto-spend
const subAccount = await baseAccountSDK.createSubAccount({
  spender: {
    address: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f', // JobMarketplace
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC
    allowance: parseUnits('10', 6) // $10 USDC allowance
  }
});

// Step 3: Initialize SDK with smart account
const smartProvider = new SmartAccountProvider({
  bundlerUrl: process.env.BUNDLER_URL,
  paymasterUrl: process.env.PAYMASTER_URL,
  accountAddress: subAccount.address
});

const sdk = new FabstirSDKCore({
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: process.env.RPC_URL,
  contractAddresses: BASE_SEPOLIA_CONTRACTS
});

await sdk.initialize(smartProvider);
```

### Gasless Session Creation

```typescript
// With smart account, users don't pay gas
const sessionManager = sdk.getSessionManager();

// Session creation is gasless - paymaster covers gas
const session = await sessionManager.startSession(
  modelId,
  hostAddress,
  {
    depositAmount: "1.0", // USDC from allowance
    pricePerToken: 200,
    duration: 3600,
    proofInterval: 100
  }
);
// User pays $1 USDC for session, but $0 for gas!

// All subsequent operations are also gasless
const response = await sessionManager.sendPrompt(
  session.sessionId,
  "Explain gasless transactions"
);
// No gas fees for sending prompts!
```

### Gasless Transaction Patterns

#### Pattern 1: Batch Operations
```typescript
// Smart accounts can batch multiple operations
const smartProvider = sdk.getWalletProvider() as SmartAccountProvider;

await smartProvider.batchTransactions([
  // Approve USDC spend
  {
    to: usdcAddress,
    data: approveCalldata
  },
  // Create session job
  {
    to: jobMarketplaceAddress,
    data: createSessionCalldata
  }
]);
// Both execute in one gasless transaction!
```

#### Pattern 2: Session Keys
```typescript
// Create temporary session key for limited operations
const sessionKey = await smartProvider.createSessionKey({
  permissions: ['sendPrompt', 'endSession'],
  duration: 3600, // 1 hour
  spendLimit: parseUnits('5', 6) // $5 USDC
});

// User can now operate without main key
const tempSdk = new FabstirSDKCore({ /* config */ });
await tempSdk.authenticate('sessionKey', { key: sessionKey });
```

## Troubleshooting

### Common Chain Issues and Solutions

#### Issue: "Unsupported chain ID"
**Error:**
```
UnsupportedChainError: Chain 999999 is not supported
```

**Solution:**
```typescript
// Check supported chains
import { ChainRegistry } from '@fabstir/sdk-core';

const supportedChains = ChainRegistry.getSupportedChains();
console.log('Supported chains:', supportedChains); // [84532, 5611]

// Validate before switching
if (ChainRegistry.isChainSupported(targetChainId)) {
  await sdk.switchChain(targetChainId);
} else {
  console.error(`Chain ${targetChainId} not supported`);
}
```

#### Issue: "Chain mismatch during operation"
**Error:**
```
ChainMismatchError: Expected chain 84532, but wallet is on chain 5611
```

**Solution:**
```typescript
// Always verify chain before operations
const currentChainId = await provider.getCurrentChainId();
const expectedChainId = sdk.getCurrentChainId();

if (currentChainId !== expectedChainId) {
  await provider.switchChain(expectedChainId);
}

// Or use automatic chain switching
try {
  await sessionManager.startSession(/* ... */);
} catch (error) {
  if (error instanceof ChainMismatchError) {
    await sdk.switchChain(error.expected);
    // Retry operation
    await sessionManager.startSession(/* ... */);
  }
}
```

#### Issue: "Insufficient deposit for chain"
**Error:**
```
InsufficientDepositError: Required 0.001 BNB, but only 0.0005 BNB available
```

**Solution:**
```typescript
// Always check minimum deposits
const chain = sdk.getCurrentChain();
const minDeposit = parseFloat(chain.minDeposit);
const userDeposit = parseFloat(depositAmount);

if (userDeposit < minDeposit) {
  console.error(`Minimum deposit: ${chain.minDeposit} ${chain.nativeToken}`);
  depositAmount = chain.minDeposit;
}
```

#### Issue: "Node doesn't support chain"
**Error:**
```
NodeChainMismatchError: Node supports chain 84532, but SDK is on chain 5611
```

**Solution:**
```typescript
// Discover chain-specific nodes
const clientManager = sdk.getClientManager();
const currentChainId = sdk.getCurrentChainId();

// Only get nodes for current chain
const nodes = await clientManager.discoverNodes(currentChainId);

// Verify node chain support
for (const node of nodes) {
  const supportedChains = await clientManager.getNodeChains(node.url);
  if (supportedChains.includes(currentChainId)) {
    // Node supports current chain
    return node;
  }
}
```

#### Issue: "MetaMask doesn't have chain"
**Error:**
```
Error: User rejected the request (4902)
```

**Solution:**
```typescript
// Automatically add chain to MetaMask
const provider = new EOAProvider(window.ethereum);

try {
  await provider.switchChain(ChainId.BASE_SEPOLIA);
} catch (error: any) {
  if (error.code === 4902) {
    // Chain not added, provider will auto-add
    console.log('Adding chain to wallet...');
    // EOAProvider handles this automatically
  }
}
```

### Debugging Chain Operations

```typescript
// Enable detailed logging
const sdk = new FabstirSDKCore({
  // ... config
  debug: true // Enable debug logs
});

// Listen to chain events
sdk.on('chainChanged', ({ oldChainId, newChainId }) => {
  console.log(`Chain changed: ${oldChainId} → ${newChainId}`);
});

// Monitor wallet provider
const provider = sdk.getWalletProvider();
provider.on('accountsChanged', (accounts) => {
  console.log('Accounts changed:', accounts);
});

provider.on('chainChanged', (chainId) => {
  console.log('Provider chain changed:', chainId);
});
```

## Best Practices

### 1. Always Verify Chain Before Operations
```typescript
async function safeOperation(sdk: FabstirSDKCore, expectedChain: number) {
  const currentChain = sdk.getCurrentChainId();
  if (currentChain !== expectedChain) {
    await sdk.switchChain(expectedChain);
  }
  // Proceed with operation
}
```

### 2. Handle Chain Switching Gracefully
```typescript
async function robustChainSwitch(sdk: FabstirSDKCore, targetChain: number) {
  try {
    await sdk.switchChain(targetChain);
  } catch (error) {
    if (error instanceof UnsupportedChainError) {
      console.error('Chain not supported');
      return false;
    }
    // Handle wallet rejection
    if (error.code === 4001) {
      console.error('User rejected chain switch');
      return false;
    }
    throw error;
  }
  return true;
}
```

### 3. Cache Chain Configurations
```typescript
const chainConfigs = new Map();

function getCachedChainConfig(chainId: number) {
  if (!chainConfigs.has(chainId)) {
    const config = ChainRegistry.getChain(chainId);
    chainConfigs.set(chainId, config);
  }
  return chainConfigs.get(chainId);
}
```

### 4. Implement Chain-Aware Error Recovery
```typescript
class ChainAwareRetry {
  async executeWithRetry(
    operation: () => Promise<any>,
    maxRetries = 3
  ) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof ChainMismatchError && i < maxRetries - 1) {
          await sdk.switchChain(error.expected);
          continue;
        }
        throw error;
      }
    }
  }
}
```

## Migration Checklist

### From Single-Chain to Multi-Chain

- [ ] **Update SDK initialization** to include chainId
- [ ] **Add all required contract addresses** (7 total)
- [ ] **Implement wallet provider** instead of direct signer
- [ ] **Add chain verification** before operations
- [ ] **Update error handling** for chain-specific errors
- [ ] **Test chain switching** functionality
- [ ] **Verify minimum deposits** per chain
- [ ] **Update node discovery** to be chain-aware
- [ ] **Test on both chains** (Base Sepolia and opBNB)
- [ ] **Document chain-specific configurations**

### Code Migration Example

**Before (Single-Chain):**
```typescript
const sdk = new FabstirSDK({
  rpcUrl: process.env.RPC_URL,
  contractAddresses: {
    jobMarketplace: process.env.CONTRACT_ADDRESS
  }
});
await sdk.authenticate(privateKey);
```

**After (Multi-Chain):**
```typescript
const sdk = new FabstirSDKCore({
  rpcUrl: process.env.RPC_URL,
  chainId: ChainId.BASE_SEPOLIA,
  contractAddresses: {
    jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
    nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
    proofSystem: process.env.CONTRACT_PROOF_SYSTEM,
    hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
    usdcToken: process.env.CONTRACT_USDC_TOKEN,
    fabToken: process.env.CONTRACT_FAB_TOKEN,
    modelRegistry: process.env.CONTRACT_MODEL_REGISTRY
  }
});

const provider = new EOAProvider(window.ethereum);
await sdk.initialize(provider);
await sdk.authenticate('privatekey', { privateKey });
```

## Additional Resources

- [SDK API Reference](/docs/SDK_API.md)
- [Contract Documentation](/docs/compute-contracts-reference/)
- [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)
- [opBNB Testnet Faucet](https://testnet.bnbchain.org/faucet-smart)
- [Base Account Kit Docs](https://docs.base.org/account-kit)

---

*Last Updated: January 2025*
*SDK Version: @fabstir/sdk-core v2.0.0*