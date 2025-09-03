# Fabstir LLM SDK Configuration Guide

This guide covers all configuration options available in the Fabstir LLM SDK, including the new headless architecture, payment methods, and best practices.

## Table of Contents

- [Configuration Overview](#configuration-overview)
- [Headless SDK Configuration](#headless-sdk-configuration)
- [FabstirLLMSDK Configuration](#fabstirllmsdk-configuration)
- [Legacy SDK Configuration](#legacy-sdk-configuration)
- [Payment Configuration](#payment-configuration)
- [Mode Configuration](#mode-configuration)
- [Network Configuration](#network-configuration)
- [P2P Configuration](#p2p-configuration)
- [Contract Configuration](#contract-configuration)
- [Performance Configuration](#performance-configuration)
- [Security Configuration](#security-configuration)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Best Practices](#best-practices)

## Configuration Overview

The SDK offers three main configuration approaches:

1. **FabstirSDKHeadless** - Headless, environment-agnostic configuration
2. **FabstirLLMSDK** - Contract-focused with automatic payment handling
3. **FabstirSDK (Legacy)** - Original configuration with provider connection

### Configuration Priority

Configuration sources are applied in this order (highest to lowest priority):

1. Runtime method parameters
2. Constructor configuration object
3. Environment variables
4. Default values

## Headless SDK Configuration

### HeadlessConfig Interface

```typescript
interface HeadlessConfig {
  // Core settings
  mode?: "mock" | "production";                    // Default: "mock"
  network?: "base-sepolia" | "base-mainnet" | "local"; // Default: "base-sepolia"
  debug?: boolean;                                 // Default: false
  
  // Contract addresses (optional overrides)
  contractAddresses?: {
    jobMarketplace?: string;
    paymentEscrow?: string;
    nodeRegistry?: string;
  };
  
  // P2P Configuration
  p2pConfig?: P2PConfig;
  
  // Discovery settings
  nodeDiscovery?: DiscoveryConfig;
  discoveryConfig?: DiscoveryConfig;              // Alias for nodeDiscovery
  
  // Error recovery
  retryOptions?: RetryOptions;
  failoverStrategy?: FailoverStrategy;
  nodeBlacklistDuration?: number;                 // Default: 3600000 (1 hour)
  enableJobRecovery?: boolean;                    // Default: true
  recoveryDataTTL?: number;                       // Default: 86400000 (24 hours)
  
  // Performance
  reliabilityThreshold?: number;                  // Default: 0.8
  nodeSelectionStrategy?: "reliability-weighted" | "random" | "price";
  maxCascadingRetries?: number;                   // Default: 3
  enableRecoveryReports?: boolean;                // Default: false
  enablePerformanceTracking?: boolean;            // Default: false
}
```

### Basic Headless Configuration

```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';

const sdk = new FabstirSDKHeadless({
  mode: 'production',
  network: 'base-sepolia',
  debug: true
});

// Set signer separately (required for blockchain operations)
const signer = await getSigner(); // Your signer logic
await sdk.setSigner(signer);
```

### Advanced Headless Configuration

```typescript
const sdk = new FabstirSDKHeadless({
  mode: 'production',
  network: 'base-mainnet',
  contractAddresses: {
    jobMarketplace: '0x...',
    paymentEscrow: '0x...',
    nodeRegistry: '0x...'
  },
  p2pConfig: {
    bootstrapNodes: [
      '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW...',
      '/ip4/35.232.100.45/tcp/4001/p2p/12D3KooW...'
    ],
    enableDHT: true,
    enableMDNS: true,
    dialTimeout: 30000,
    requestTimeout: 60000
  },
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2
  },
  nodeSelectionStrategy: 'reliability-weighted',
  enablePerformanceTracking: true
});
```

## FabstirLLMSDK Configuration

Specialized SDK for contract interactions with payment support:

```typescript
import { FabstirLLMSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

// Requires a provider with signer
const provider = new ethers.providers.Web3Provider(window.ethereum);
const sdk = new FabstirLLMSDK(provider);

// Submit job with payment configuration
await sdk.submitJob({
  modelId: 'gpt-3.5-turbo',
  prompt: 'Hello world',
  maxTokens: 100,
  offerPrice: '1000000',      // Price in payment token units
  paymentToken: 'USDC',        // 'ETH' or 'USDC'
  paymentAmount: '1000000',    // Optional: different from offer price
  temperature: 0.7,
  seed: 42,
  resultFormat: 'json'
});
```

## Legacy SDK Configuration

For backward compatibility:

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';

const sdk = new FabstirSDK({
  mode: 'production',
  network: 'base-sepolia',
  // ... other config
});

// Requires connect() call
await sdk.connect(provider);
```

## Payment Configuration

### Supported Payment Tokens

```typescript
// Base Sepolia test tokens
const BASE_SEPOLIA_TOKENS = {
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  FAB: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'
};

// Base Mainnet tokens
const BASE_MAINNET_TOKENS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  // FAB and other tokens TBD
};
```

### Payment Method Selection

```typescript
// ETH payment (native token)
await sdk.submitJob({
  // ... job params
  paymentToken: 'ETH',
  offerPrice: '1000000000000000'  // Wei units (18 decimals)
});

// USDC payment (ERC20 token)
await sdk.submitJob({
  // ... job params
  paymentToken: 'USDC',
  offerPrice: '1000000',          // USDC units (6 decimals)
  paymentAmount: '1000000'         // Can differ from offer price
});

// Default to ETH if not specified
await sdk.submitJob({
  // ... job params
  offerPrice: '1000000000000000'  // Defaults to ETH
});
```

## Mode Configuration

### Mock Mode

For development and testing without real network:

```typescript
const sdk = new FabstirSDKHeadless({
  mode: 'mock',
  // P2P and contract interactions are simulated
});

// Mock mode features:
// - Instant job responses
// - No real blockchain transactions
// - Simulated P2P discovery
// - Predictable test data
```

### Production Mode

For real network interactions:

```typescript
const sdk = new FabstirSDKHeadless({
  mode: 'production',
  p2pConfig: {
    bootstrapNodes: [...] // Required for production
  }
});
```

## Network Configuration

### Supported Networks

```typescript
type Network = "base-sepolia" | "base-mainnet" | "local";

// Network chain IDs
const CHAIN_IDS = {
  "base-mainnet": 8453,
  "base-sepolia": 84532,
  "local": 31337
};
```

### Custom RPC Configuration

```typescript
// Using custom RPC endpoint
const provider = new ethers.providers.JsonRpcProvider({
  url: 'https://your-rpc-endpoint.com',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const signer = provider.getSigner();
await sdk.setSigner(signer);
```

## P2P Configuration

### P2PConfig Interface

```typescript
interface P2PConfig {
  // Required
  bootstrapNodes: string[];           // Multiaddrs of bootstrap nodes
  
  // Optional
  enableDHT?: boolean;                // Default: true
  enableMDNS?: boolean;               // Default: true (local discovery)
  listenAddresses?: string[];         // Custom listen addresses
  dialTimeout?: number;               // Default: 30000ms
  requestTimeout?: number;            // Default: 60000ms
  maxConnections?: number;            // Default: 50
  minConnections?: number;            // Default: 5
  
  // DHT Configuration
  dhtConfig?: {
    kBucketSize?: number;            // Default: 20
    alpha?: number;                  // Default: 3
    randomWalk?: {
      enabled?: boolean;              // Default: true
      interval?: number;              // Default: 300000ms
      timeout?: number;               // Default: 10000ms
    };
  };
}
```

### P2P Configuration Example

```typescript
const p2pConfig: P2PConfig = {
  bootstrapNodes: [
    '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW...',
    '/ip4/35.232.100.45/tcp/4001/p2p/12D3KooW...',
    '/dnsaddr/bootstrap.fabstir.network/p2p/12D3KooW...'
  ],
  enableDHT: true,
  enableMDNS: true,
  listenAddresses: [
    '/ip4/0.0.0.0/tcp/0',
    '/ip4/0.0.0.0/tcp/0/ws'
  ],
  dialTimeout: 30000,
  requestTimeout: 60000,
  maxConnections: 100,
  minConnections: 10,
  dhtConfig: {
    kBucketSize: 20,
    randomWalk: {
      enabled: true,
      interval: 300000,
      timeout: 10000
    }
  }
};
```

## Contract Configuration

### Contract Addresses

```typescript
interface ContractAddresses {
  jobMarketplace: string;
  paymentEscrow: string;
  nodeRegistry: string;
}

// Default addresses (Base Sepolia)
const DEFAULT_CONTRACTS = {
  jobMarketplace: '0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A',
  proofSystem: '0xE7dfB24117a525fCEA51718B1D867a2D779A7Bb9',
  nodeRegistry: '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
  hostEarnings: '0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E',
  paymentEscrow: '0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C'
};

// Override default addresses
const sdk = new FabstirSDKHeadless({
  contractAddresses: {
    jobMarketplace: '0xYourCustomAddress',
    // Others will use defaults
  }
});
```

## Performance Configuration

### Retry Options

```typescript
interface RetryOptions {
  maxRetries?: number;           // Default: 3
  retryDelay?: number;           // Default: 1000ms
  backoffMultiplier?: number;     // Default: 2
  maxRetryDelay?: number;        // Default: 30000ms
  retryCondition?: (error: Error) => boolean;
}

const retryOptions: RetryOptions = {
  maxRetries: 5,
  retryDelay: 2000,
  backoffMultiplier: 1.5,
  maxRetryDelay: 60000,
  retryCondition: (error) => {
    // Retry on network errors, not on user errors
    return error.code === 'NETWORK_ERROR' || 
           error.code === 'TIMEOUT';
  }
};
```

### Failover Strategy

```typescript
type FailoverStrategy = 
  | "sequential"      // Try nodes in order
  | "random"         // Random selection
  | "fastest"        // Select by latency
  | "cheapest";      // Select by price

const sdk = new FabstirSDKHeadless({
  failoverStrategy: 'fastest',
  nodeBlacklistDuration: 3600000, // 1 hour
  reliabilityThreshold: 0.8
});
```

## Security Configuration

### Signer Management

```typescript
// Never store private keys in config!
// Always use secure signer management

// Good: Pass signer from wallet
const signer = await getWalletSigner();
await sdk.setSigner(signer);

// Good: Use hardware wallet
const ledgerSigner = await getLedgerSigner();
await sdk.setSigner(ledgerSigner);

// Bad: Never do this!
// const privateKey = '0x...'; // NEVER!
```

### Network Validation

```typescript
// Enable strict network validation
const sdk = new FabstirSDKHeadless({
  network: 'base-mainnet',
  // SDK will reject signers on wrong network
});

// Handle network mismatch
try {
  await sdk.setSigner(signer);
} catch (error) {
  if (error.message.includes('Wrong network')) {
    // Prompt user to switch networks
    await switchNetwork('base-mainnet');
  }
}
```

## Environment Variables

Supported environment variables:

```bash
# Network Configuration
FABSTIR_NETWORK=base-sepolia
FABSTIR_RPC_URL=https://sepolia.base.org

# Contract Addresses (Base Sepolia)
FABSTIR_JOB_MARKETPLACE=0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A
FABSTIR_PROOF_SYSTEM=0xE7dfB24117a525fCEA51718B1D867a2D779A7Bb9
FABSTIR_NODE_REGISTRY=0x87516C13Ea2f99de598665e14cab64E191A0f8c4
FABSTIR_HOST_EARNINGS=0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E
FABSTIR_PAYMENT_ESCROW=0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C

# P2P Configuration
FABSTIR_BOOTSTRAP_NODES=/ip4/34.70.224.193/tcp/4001/p2p/...,/ip4/35.232.100.45/tcp/4001/p2p/...
FABSTIR_P2P_PORT=4001
FABSTIR_ENABLE_DHT=true
FABSTIR_ENABLE_MDNS=true

# Performance
FABSTIR_MAX_RETRIES=3
FABSTIR_RETRY_DELAY=1000
FABSTIR_NODE_SELECTION=reliability-weighted

# Debug
FABSTIR_DEBUG=true
FABSTIR_LOG_LEVEL=debug
```

### Loading Environment Variables

```typescript
// Automatic loading in Node.js
import dotenv from 'dotenv';
dotenv.config();

const sdk = new FabstirSDKHeadless({
  network: process.env.FABSTIR_NETWORK || 'base-sepolia',
  debug: process.env.FABSTIR_DEBUG === 'true',
  contractAddresses: {
    jobMarketplace: process.env.FABSTIR_JOB_MARKETPLACE,
    paymentEscrow: process.env.FABSTIR_PAYMENT_ESCROW,
    nodeRegistry: process.env.FABSTIR_NODE_REGISTRY
  },
  p2pConfig: process.env.FABSTIR_BOOTSTRAP_NODES ? {
    bootstrapNodes: process.env.FABSTIR_BOOTSTRAP_NODES.split(','),
    enableDHT: process.env.FABSTIR_ENABLE_DHT !== 'false',
    enableMDNS: process.env.FABSTIR_ENABLE_MDNS !== 'false'
  } : undefined
});
```

## Configuration Examples

### Development Configuration

```typescript
// Development with mock mode
const devConfig: HeadlessConfig = {
  mode: 'mock',
  network: 'local',
  debug: true,
  enablePerformanceTracking: true,
  enableRecoveryReports: true
};
```

### Testing Configuration

```typescript
// Testing with real network but safe defaults
const testConfig: HeadlessConfig = {
  mode: 'production',
  network: 'base-sepolia',
  debug: true,
  p2pConfig: {
    bootstrapNodes: ['...'],
    dialTimeout: 5000,      // Faster timeouts for tests
    requestTimeout: 10000
  },
  retryOptions: {
    maxRetries: 1,          // Minimal retries for tests
    retryDelay: 100
  }
};
```

### Production Configuration

```typescript
// Production with all features
const prodConfig: HeadlessConfig = {
  mode: 'production',
  network: 'base-mainnet',
  debug: false,
  p2pConfig: {
    bootstrapNodes: [
      // Multiple bootstrap nodes for redundancy
      '/dnsaddr/bootstrap1.fabstir.network/p2p/...',
      '/dnsaddr/bootstrap2.fabstir.network/p2p/...',
      '/dnsaddr/bootstrap3.fabstir.network/p2p/...'
    ],
    enableDHT: true,
    enableMDNS: false,      // Disable local discovery in production
    maxConnections: 200,
    minConnections: 20
  },
  retryOptions: {
    maxRetries: 5,
    retryDelay: 2000,
    backoffMultiplier: 2
  },
  failoverStrategy: 'fastest',
  nodeSelectionStrategy: 'reliability-weighted',
  enableJobRecovery: true,
  enablePerformanceTracking: true,
  nodeBlacklistDuration: 7200000  // 2 hours
};
```

## Best Practices

### 1. Signer Management

```typescript
// ✅ Good: Dynamic signer management
class MyApp {
  private sdk: FabstirSDKHeadless;
  
  async connectWallet() {
    const signer = await getUserSigner();
    await this.sdk.setSigner(signer);
  }
  
  async disconnectWallet() {
    this.sdk.clearSigner();
  }
  
  async switchAccount(newSigner: Signer) {
    await this.sdk.setSigner(newSigner);
  }
}

// ❌ Bad: Storing private keys
const sdk = new FabstirSDK({
  privateKey: '0x...' // NEVER DO THIS
});
```

### 2. Network Handling

```typescript
// ✅ Good: Handle network changes
provider.on('network', async (newNetwork) => {
  if (newNetwork.chainId !== expectedChainId) {
    sdk.clearSigner();
    alert('Please switch to the correct network');
  }
});

// ✅ Good: Validate before operations
if (!sdk.hasSigner()) {
  throw new Error('Please connect wallet first');
}
```

### 3. Error Recovery

```typescript
// ✅ Good: Comprehensive error handling
try {
  const job = await sdk.submitJob(params);
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    // Handle insufficient USDC
    alert('Please add USDC to your wallet');
  } else if (error.code === 'WRONG_NETWORK') {
    // Handle network mismatch
    await switchNetwork();
  } else if (error.code === 'CONNECTION_FAILED') {
    // Retry with exponential backoff
    await retryWithBackoff(() => sdk.submitJob(params));
  }
}
```

### 4. Performance Optimization

```typescript
// ✅ Good: Cache discovered nodes
const nodeCache = new Map();

async function getNodes(modelId: string) {
  if (nodeCache.has(modelId)) {
    const cached = nodeCache.get(modelId);
    if (Date.now() - cached.timestamp < 300000) { // 5 min TTL
      return cached.nodes;
    }
  }
  
  const nodes = await sdk.discoverNodes({ modelId });
  nodeCache.set(modelId, { nodes, timestamp: Date.now() });
  return nodes;
}
```

### 5. Payment Token Selection

```typescript
// ✅ Good: Let users choose payment method
async function submitJobWithUserChoice(params: JobParams) {
  const paymentMethod = await promptUser('Select payment method:', ['ETH', 'USDC']);
  
  if (paymentMethod === 'USDC') {
    // Check USDC balance first
    const balance = await checkUSDCBalance();
    if (balance < params.offerPrice) {
      throw new Error('Insufficient USDC balance');
    }
  }
  
  return sdk.submitJob({
    ...params,
    paymentToken: paymentMethod
  });
}
```