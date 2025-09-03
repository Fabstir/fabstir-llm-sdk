# Fabstir LLM SDK - Auth Module Integration Guide

## SDK Interface for Authentication Module

This document defines the minimal SDK interface that the `fabstir-llm-auth` module needs to integrate with the Fabstir LLM SDK.

## SDK Configuration

### SDKConfig Type Definition

The auth module expects the following configuration structure when initializing the SDK:

```typescript
interface SDKConfig {
  // Contract address for the JobMarketplace
  contractAddress: string;
  
  // Discovery service URL for finding hosts
  discoveryUrl: string;
  
  // S5 seed phrase (12-word mnemonic) - provided by auth module
  s5SeedPhrase: string;
  
  // Optional S5 portal URL
  s5PortalUrl?: string;
  
  // Optional cache configuration
  cacheConfig?: {
    maxEntries?: number;
    ttl?: number;
  };
  
  // Enable/disable S5 storage (defaults to true)
  enableS5?: boolean;
}
```

## SDK Constructor Signatures

The SDK provides multiple classes that accept authentication credentials:

### FabstirSessionSDK

```typescript
class FabstirSessionSDK {
  constructor(
    config: SDKConfig,
    signer: ethers.Signer  // Provided by auth module
  )
}
```

### FabstirSDK (Main SDK)

```typescript
class FabstirSDK {
  // Initialize with provider
  async connect(provider: ethers.providers.Provider): Promise<void>
  
  // Or set signer directly
  async setSigner(signer: ethers.Signer): Promise<void>
}
```

### FabstirSDKHeadless (React Adapter)

```typescript
class FabstirSDKHeadless {
  constructor(config: SDKConfig)
  
  // Set signer after initialization
  async setSigner(signer: ethers.Signer): Promise<void>
}
```

## Authentication Flow Integration

### 1. Get Credentials from Auth Module

```typescript
import { AuthManager } from '@fabstir/llm-auth';

const authManager = new AuthManager();
// ... register providers and authenticate ...

const credentials = await authManager.exportForSDK();
// credentials contains:
// - signer: ethers.Signer
// - s5Seed: string (12-word mnemonic)
// - userId: string
// - capabilities: AuthCapabilities
```

### 2. Initialize SDK with Credentials

```typescript
import { FabstirSessionSDK } from '@fabstir/llm-sdk';

const sdkConfig: SDKConfig = {
  contractAddress: '0x445882e14b22E921c7d4Fe32a7736a32197578AF',
  discoveryUrl: 'https://discovery.fabstir.com',
  s5SeedPhrase: credentials.s5Seed,  // From auth module
  s5PortalUrl: 'https://s5.fabstir.com',
  enableS5: true
};

// Option A: FabstirSessionSDK (direct initialization)
const sessionSDK = new FabstirSessionSDK(
  sdkConfig,
  credentials.signer  // From auth module
);

// Option B: FabstirSDK (set signer after connect)
const sdk = new FabstirSDK({ network: 'base-sepolia' });
await sdk.setSigner(credentials.signer);
```

## Required Types from SDK

### Message Type

```typescript
interface Message {
  id: string;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
```

### Session Type

```typescript
interface Session {
  jobId: number;
  client: string;
  status: string;
  params: SessionParams;
  checkpointCount: number;
  lastCheckpoint: number;
  currentCost: string;
  host: Host;
  messages: Message[];
  websocketUrl: string;
  tokensUsed: number;
}
```

### Host Type

```typescript
interface Host {
  id: string;
  address: string;
  url: string;
  models: string[];
  pricePerToken: string;
  available: boolean;
}
```

### SessionParams Type

```typescript
interface SessionParams {
  duration: number;
  maxInactivity: number;
  messageLimit: number;
  checkpointInterval: number;
}
```

### PaymentReceipt Type

```typescript
interface PaymentReceipt {
  sessionId: number;
  totalTokens: number;
  totalCost: string;
  transactionHash: string;
}
```

## Integration Example

```typescript
import { AuthManager, BaseAccountProvider } from '@fabstir/llm-auth';
import { FabstirSessionSDK } from '@fabstir/llm-sdk';
import type { SDKConfig } from '@fabstir/llm-sdk/session-types';

// 1. Setup authentication
const authManager = new AuthManager();
const baseProvider = new BaseAccountProvider({
  appName: 'My LLM App',
  testnet: true  // Enable gas sponsorship
});
authManager.registerProvider(baseProvider);

// 2. Authenticate user
await authManager.authenticate('base', 'username');

// 3. Get credentials for SDK
const credentials = await authManager.exportForSDK();

// 4. Configure SDK with auth credentials
const sdkConfig: SDKConfig = {
  contractAddress: process.env.CONTRACT_ADDRESS!,
  discoveryUrl: process.env.DISCOVERY_URL!,
  s5SeedPhrase: credentials.s5Seed,  // From auth module
  enableS5: true
};

// 5. Initialize SDK
const sdk = new FabstirSessionSDK(
  sdkConfig,
  credentials.signer  // From auth module
);

// 6. Use SDK with authenticated session
const hosts = await sdk.findHosts({ model: 'llama2-7b' });
const session = await sdk.startSession(hosts[0], 0.1);
await sdk.sendPrompt('Hello, how are you?');
```

## Key Integration Points

1. **Signer**: The auth module provides an `ethers.Signer` that the SDK uses for:
   - Signing blockchain transactions
   - Creating and completing sessions
   - Payment authorization

2. **S5 Seed**: The auth module provides a deterministic 12-word mnemonic that the SDK uses for:
   - Decentralized storage of conversation history
   - Cross-session data recovery
   - User-controlled data persistence

3. **Capabilities**: The auth module provides capability flags that inform the SDK about:
   - Gas sponsorship availability
   - Smart wallet features
   - Passkey authentication status

## Environment Variables

The SDK expects certain environment variables that the auth module doesn't provide:

```bash
# Contract addresses (SDK-specific)
CONTRACT_JOB_MARKETPLACE=0x445882e14b22E921c7d4Fe32a7736a32197578AF

# Discovery service (SDK-specific)
DISCOVERY_URL=https://discovery.fabstir.com

# S5 Portal (optional, SDK-specific)
S5_PORTAL_URL=https://s5.fabstir.com
```

## Error Handling

The SDK throws standard errors that the auth integration should handle:

```typescript
try {
  const sdk = new FabstirSessionSDK(config, signer);
  await sdk.startSession(host, deposit);
} catch (error) {
  if (error.message.includes('No active session')) {
    // Handle session errors
  } else if (error.message.includes('Insufficient funds')) {
    // Handle payment errors
  }
}
```

## Notes

- The SDK requires `ethers` v5.x (same as auth module)
- The signer must have sufficient funds for transactions (unless gas sponsorship is enabled)
- S5 storage is optional but recommended for conversation persistence
- The SDK can operate without S5 if `enableS5: false` is set