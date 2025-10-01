# Fabstir LLM SDK Quick Reference

Quick reference guide for the Fabstir LLM SDK with manager-based architecture.

## Installation

### Development (npm link)
```bash
# In SDK directory
cd packages/sdk-core
pnpm build
npm link

# In your application
npm link @fabstir/sdk-core
```

### Production
```bash
npm install @fabstir/sdk-core ethers
```

## Quick Start

### Basic SDK Usage

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

// Initialize SDK
const sdk = new FabstirSDKCore({
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/your-key',
  s5PortalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
});

// Authenticate
await sdk.authenticate('0x1234567890abcdef...');

// Get managers
const sessionManager = await sdk.getSessionManager();
const storageManager = await sdk.getStorageManager();
```

## Manager Pattern

The SDK uses a manager-based architecture with 8 specialized managers:

### 1. AuthManager
```typescript
const authManager = sdk.getAuthManager();

// Check authentication
if (authManager.isAuthenticated()) {
  const address = authManager.getUserAddress();
  const signer = authManager.getSigner();
  const s5Seed = authManager.getS5Seed();
}
```

### 2. PaymentManager
```typescript
const paymentManager = sdk.getPaymentManager();

// ETH payment
const ethJob = await paymentManager.createETHSessionJob(
  hostAddress,    // '0x...'
  '0.005',        // ETH amount
  5000,           // price per token
  3600,           // duration (seconds)
  300             // proof interval
);

// USDC payment (requires approval)
await paymentManager.approveUSDC(usdcAddress, '100');
const usdcJob = await paymentManager.createUSDCSessionJob(
  hostAddress,
  usdcAddress,
  '100',          // USDC amount
  5000,           // price per token
  3600,           // duration
  300             // proof interval
);
```

### 3. StorageManager
```typescript
const storageManager = await sdk.getStorageManager();

// Store data
const cid = await storageManager.storeData(
  'my-key',
  { data: 'value' },
  { metadata: 'optional' }
);

// Retrieve data
const data = await storageManager.retrieveData('my-key');

// List user data
const userDataList = await storageManager.listUserData();
```

### 4. DiscoveryManager
```typescript
const discoveryManager = sdk.getDiscoveryManager();

// Create P2P node
const peerId = await discoveryManager.createNode({
  listen: ['/ip4/127.0.0.1/tcp/0'],
  bootstrap: []
});

// Find host
const hostAddress = await discoveryManager.findHost({
  minReputation: 100
});

// Send/receive messages
discoveryManager.onMessage((msg) => console.log(msg));
await discoveryManager.sendMessage(peerId, { type: 'hello' });
```

### 5. SessionManager
```typescript
const sessionManager = await sdk.getSessionManager();

// Create session
const session = await sessionManager.createSession({
  paymentType: 'ETH',
  amount: '0.005',
  pricePerToken: 5000,
  duration: 3600,
  hostAddress: '0x...' // or use hostCriteria for auto-discovery
});

// Submit proof
await sessionManager.submitProof(session.sessionId, proofData);

// Complete session
const result = await sessionManager.completeSession(session.sessionId);
console.log('Payment distribution:', result.paymentDistribution);
```

## Common Patterns

### Session with Auto-Discovery
```typescript
const session = await sessionManager.createSession({
  paymentType: 'ETH',
  amount: '0.005',
  hostCriteria: {
    minReputation: 50,
    preferredModels: ['llama-3.2-1b-instruct']
  }
});
```

### Store Session Conversation
```typescript
const conversation = {
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
  ],
  timestamp: Date.now()
};

await sessionManager.storeSessionData(
  session.sessionId,
  conversation
);
```

### Error Handling
```typescript
try {
  await sessionManager.createSession(options);
} catch (error: any) {
  switch (error.code) {
    case 'AUTH_FAILED':
      console.error('Authentication failed');
      break;
    case 'INSUFFICIENT_BALANCE':
      console.error('Insufficient balance');
      break;
    case 'SESSION_NOT_FOUND':
      console.error('Session not found');
      break;
    default:
      console.error('Unexpected error:', error);
  }
}
```

## Constants

```typescript
// Payment defaults
MIN_ETH_PAYMENT = '0.005'
DEFAULT_PRICE_PER_TOKEN = 5000
DEFAULT_DURATION = 3600
DEFAULT_PROOF_INTERVAL = 300

// Payment split
PAYMENT_SPLIT = { 
  host: 0.9,      // 90% to host
  treasury: 0.1   // 10% to treasury
}

// Network
BASE_SEPOLIA_CHAIN_ID = 84532
```

## Contract Addresses

**Source of Truth:** `.env.test`

All contract addresses are maintained in the `.env.test` file at the repository root. This is the single source of truth for all contract deployments.

## Environment Variables

```bash
# .env.test (see repository root for current addresses)
PRIVATE_KEY=0x...
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/your-key
S5_PORTAL_URL=wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p

# Fabstir contract addresses - see .env.test for current deployments
CONTRACT_JOB_MARKETPLACE=...
CONTRACT_NODE_REGISTRY=...
CONTRACT_PROOF_SYSTEM=...
CONTRACT_HOST_EARNINGS=...
CONTRACT_MODEL_REGISTRY=...
CONTRACT_USDC_TOKEN=...
CONTRACT_FAB_TOKEN=...

# Base protocol contracts (not Fabstir contracts)
BASE_CONTRACT_SPEND_PERMISSION_MANAGER=...  # Base Account Kit infrastructure
```

## Full Example

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Initialize and authenticate
  const sdk = new FabstirSDKCore();
  await sdk.authenticate(process.env.PRIVATE_KEY!);
  
  // Get managers
  const sessionManager = await sdk.getSessionManager();
  const storageManager = await sdk.getStorageManager();
  const discoveryManager = sdk.getDiscoveryManager();
  
  // Find host via P2P
  await discoveryManager.createNode();
  const hostAddress = await discoveryManager.findHost({
    minReputation: 100
  });
  
  // Create session
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005',
    hostAddress
  });
  
  // Store conversation
  await storageManager.storeData(
    `session-${session.sessionId}`,
    { prompt: 'Hello AI!', timestamp: Date.now() }
  );
  
  // Complete session
  const completion = await sessionManager.completeSession(session.sessionId);
  console.log('Payment distributed:', completion.paymentDistribution);
}

main().catch(console.error);
```

## See Also

- [Full API Reference](SDK_API.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Integration Tests](INTEGRATED_TESTING.md)
- [Examples Directory](../examples/)