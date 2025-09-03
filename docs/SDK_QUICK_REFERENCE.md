# Fabstir LLM SDK Quick Reference

Quick reference guide for the Fabstir LLM SDK with headless architecture and USDC/ETH payments.

## Installation

```bash
npm install @fabstir/llm-sdk ethers
```

## Quick Start

### Headless SDK (Recommended)

```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

// Create SDK
const sdk = new FabstirSDKHeadless({
  mode: 'production',
  network: 'base-sepolia'
});

// Set signer
const signer = await getSigner();
await sdk.setSigner(signer);

// Submit job with USDC
const job = await sdk.submitJob({
  modelId: 'gpt-3.5-turbo',
  prompt: 'Hello world',
  maxTokens: 100,
  offerPrice: '1000000',    // 1 USDC
  paymentToken: 'USDC'
});
```

### FabstirLLMSDK (Contract-focused)

```typescript
import { FabstirLLMSDK } from '@fabstir/llm-sdk';

const provider = new ethers.providers.Web3Provider(window.ethereum);
const sdk = new FabstirLLMSDK(provider);

// Automatic USDC approval handling
const jobId = await sdk.submitJob({
  modelId: 'gpt-3.5-turbo',
  prompt: 'Hello world',
  maxTokens: 100,
  offerPrice: '1000000',
  paymentToken: 'USDC'
});
```

## Core Classes

| Class | Purpose | Key Features |
|-------|---------|--------------|
| `FabstirSDKHeadless` | Main SDK, environment-agnostic | Dynamic signer, no browser deps |
| `FabstirLLMSDK` | Contract interactions | Auto USDC approval, payment routing |
| `FabstirSDK` | Legacy compatibility | Requires `connect()` call |
| `HeadlessContractManager` | Contract operations | Signer passed per method |

## Payment Methods

### Supported Tokens

| Token | Symbol | Decimals | Base Sepolia Address |
|-------|--------|----------|---------------------|
| Ether | ETH | 18 | Native |
| USD Coin | USDC | 6 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| FAB Token | FAB | 18 | `0xC78949004B4EB6dEf2D66e49Cd81231472612D62` |

### Payment Examples

```typescript
// ETH Payment
await sdk.submitJob({
  // ... job params
  offerPrice: '1000000000000000',  // 0.001 ETH (wei)
  paymentToken: 'ETH'
});

// USDC Payment
await sdk.submitJob({
  // ... job params
  offerPrice: '1000000',           // 1 USDC (6 decimals)
  paymentToken: 'USDC',
  paymentAmount: '1000000'         // Optional: different amount
});
```

## Signer Management

### Setting Signer

```typescript
// MetaMask
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
await sdk.setSigner(signer);

// WalletConnect
const wcSigner = await getWalletConnectSigner();
await sdk.setSigner(wcSigner);

// Hardware Wallet
const ledgerSigner = await getLedgerSigner();
await sdk.setSigner(ledgerSigner);
```

### Dynamic Updates

```typescript
// Switch account
await sdk.setSigner(newSigner);

// Clear signer
sdk.clearSigner();

// Check status
if (sdk.hasSigner()) {
  const address = await sdk.getSignerAddress();
}
```

## Configuration

### Minimal Config

```typescript
const sdk = new FabstirSDKHeadless({
  mode: 'production',
  network: 'base-sepolia'
});
```

### Full Config

```typescript
const sdk = new FabstirSDKHeadless({
  mode: 'production',
  network: 'base-sepolia',
  debug: true,
  contractAddresses: {
    jobMarketplace: '0x...',
    paymentEscrow: '0x...',
    nodeRegistry: '0x...'
  },
  p2pConfig: {
    bootstrapNodes: [...],
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
  failoverStrategy: 'fastest'
});
```

## Common Operations

### Submit Job

```typescript
const job = await sdk.submitJob({
  modelId: 'gpt-3.5-turbo',       // Required
  prompt: 'Your prompt',           // Required
  maxTokens: 100,                  // Required
  offerPrice: '1000000',           // Required (token units)
  paymentToken: 'USDC',            // Optional (default: 'ETH')
  paymentAmount: '1000000',        // Optional
  temperature: 0.7,                // Optional
  seed: 42,                        // Optional
  resultFormat: 'json'             // Optional
});
```

### Discover Nodes

```typescript
const nodes = await sdk.discoverNodes({
  modelId: 'gpt-3.5-turbo',
  maxLatency: 1000,
  minReputation: 80,
  maxPrice: '2000000000000000',
  forceRefresh: true
});
```

### Get Job Status

```typescript
const status = await sdk.getJobStatus(jobId);
// Returns: JobStatus enum value
```

## Events

### Connection Events

```typescript
sdk.on('connected', ({ address, chainId }) => {
  console.log(`Connected: ${address} on chain ${chainId}`);
});

sdk.on('disconnected', () => {
  console.log('Disconnected');
});
```

### Job Events

```typescript
sdk.on('job:submitted', ({ jobId, request }) => {});
sdk.on('job:processing', ({ jobId }) => {});
sdk.on('job:completed', ({ jobId, result }) => {});
sdk.on('job:failed', ({ jobId, error }) => {});
```

### Payment Events (FabstirLLMSDK)

```typescript
sdk.on('jobSubmitted', ({ jobId, paymentToken, txHash }) => {
  console.log(`Job ${jobId} paid with ${paymentToken}`);
  console.log(`Transaction: ${txHash}`);
});
```

## React Integration

### Basic Hook

```typescript
import { useSDK } from '@fabstir/llm-sdk/adapters/react';

function Component() {
  const sdk = useSDK(config, signer);
  
  if (!sdk) return <div>Connecting...</div>;
  
  // Use SDK
}
```

### Advanced Hook

```typescript
import { useSDKWithState } from '@fabstir/llm-sdk/adapters/react';

function Component() {
  const {
    sdk,
    isConnected,
    isLoading,
    error,
    jobs,
    submitJob,
    discoverNodes
  } = useSDKWithState(config, signer);
  
  // Use SDK with state management
}
```

## Error Handling

### Error Codes

```typescript
enum ErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  WRONG_NETWORK = 'WRONG_NETWORK',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',  // USDC
  APPROVAL_FAILED = 'APPROVAL_FAILED',            // USDC
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  INVALID_INPUT = 'INVALID_INPUT'
}
```

### Error Handling Pattern

```typescript
try {
  const job = await sdk.submitJob(params);
} catch (error) {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      alert('Please add USDC to your wallet');
      break;
    case 'WRONG_NETWORK':
      await switchNetwork();
      break;
    case 'APPROVAL_FAILED':
      console.error('USDC approval rejected');
      break;
    default:
      console.error('Unknown error:', error);
  }
}
```

## Network Configuration

### Supported Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Base Mainnet | 8453 | https://mainnet.base.org |
| Base Sepolia | 84532 | https://sepolia.base.org |
| Local | 31337 | http://localhost:8545 |

### Contract Addresses (Base Sepolia)

```typescript
const CONTRACTS = {
  JobMarketplace: '0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A',
  ProofSystem: '0xE7dfB24117a525fCEA51718B1D867a2D779A7Bb9',
  NodeRegistry: '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
  HostEarnings: '0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E',
  PaymentEscrow: '0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C',
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  FAB: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'
};
```

## Migration Cheatsheet

### From Legacy SDK

| Old (FabstirSDK) | New (FabstirSDKHeadless) |
|------------------|--------------------------|
| `new FabstirSDK(config)` | `new FabstirSDKHeadless(config)` |
| `sdk.connect(provider)` | `sdk.setSigner(signer)` |
| `price: '1000'` (FAB) | `offerPrice: '1000000', paymentToken: 'USDC'` |
| Provider in constructor | Signer set dynamically |
| Browser-only | Works anywhere |

### From FAB to USDC/ETH

| Old (FAB Tokens) | New (USDC/ETH) |
|------------------|----------------|
| Implicit FAB payment | Explicit `paymentToken` |
| Single token type | Multiple tokens supported |
| Manual approval | Automatic approval |
| `price` parameter | `offerPrice` + `paymentAmount` |

## Best Practices

### ✅ DO

- Set signer before blockchain operations
- Handle network mismatches gracefully
- Check balances before submission
- Use mock mode for development
- Clean up with `disconnect()`
- Cache discovered nodes
- Use TypeScript for type safety

### ❌ DON'T

- Store private keys in code
- Create SDK in every render (React)
- Ignore error handling
- Use production mode for tests
- Hardcode contract addresses
- Skip network validation

## Environment Variables

```bash
# .env file
FABSTIR_NETWORK=base-sepolia
FABSTIR_RPC_URL=https://sepolia.base.org
FABSTIR_JOB_MARKETPLACE=0x...
FABSTIR_BOOTSTRAP_NODES=/ip4/34.70.224.193/tcp/4001/p2p/...
FABSTIR_DEBUG=true
```

## Testing

### Mock Mode

```typescript
const sdk = new FabstirSDKHeadless({
  mode: 'mock'  // No real network calls
});

// Mock signer
const mockSigner = {
  provider: { getNetwork: async () => ({ chainId: 84532 }) },
  getAddress: async () => '0x...'
};

await sdk.setSigner(mockSigner);
```

### Test Pattern

```typescript
describe('Job Submission', () => {
  let sdk: FabstirSDKHeadless;
  
  beforeEach(() => {
    sdk = new FabstirSDKHeadless({ mode: 'mock' });
  });
  
  afterEach(async () => {
    await sdk.disconnect();
  });
  
  it('should submit job', async () => {
    // Test implementation
  });
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No signer available" | Call `setSigner()` first |
| "Wrong network" | Switch to Base Sepolia |
| "Insufficient USDC" | Add USDC to wallet |
| "Approval failed" | Check USDC balance and retry |
| "Connection failed" | Check bootstrap nodes |
| "Job not found" | Verify job ID and network |

## Links

- [Full API Reference](./API.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Examples](./EXAMPLES.md)
- [Architecture](./ARCHITECTURE.md)
- [GitHub](https://github.com/fabstir/llm-sdk)
- [Discord](https://discord.gg/fabstir)