# Fabstir LLM SDK Setup Guide

This guide walks you through setting up the Fabstir LLM SDK with the new manager-based architecture, including prerequisites, installation, configuration, and your first session creation.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Quick Start](#quick-start)
- [Manager Configuration](#manager-configuration)
- [Contract Setup](#contract-setup)
- [S5 Storage Setup](#s5-storage-setup)
- [P2P Network Setup](#p2p-network-setup)
- [Testing Your Setup](#testing-your-setup)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

## Prerequisites

### Required Software

- **Node.js** v16.0 or higher (v18+ recommended)
  ```bash
  node --version  # Should output v16.0.0 or higher
  ```

- **npm** or **pnpm** (recommended)
  ```bash
  # Install pnpm if you don't have it
  npm install -g pnpm
  ```

- **TypeScript** 4.5 or higher (for TypeScript projects)
  ```bash
  npm install -g typescript
  ```

### Blockchain Requirements

- **Ethereum Wallet** with private key access
- **Base Sepolia ETH** for gas fees (minimum 0.01 ETH)
  - Get from [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet)
  - Or [Alchemy Faucet](https://basesepolia-faucet.com)
- **Base Sepolia USDC** for USDC payments (optional)

## Installation

### 1. Production Installation

Install from npm registry:

```bash
npm install @fabstir/llm-sdk ethers
# or
pnpm add @fabstir/llm-sdk ethers
```

### 2. Development Installation (npm link)

For local development with both SDK and UI:

```bash
# Clone and setup SDK
git clone https://github.com/yourusername/fabstir-llm-sdk.git
cd fabstir-llm-sdk
npm install
npm link

# In your project
cd your-project
npm link @fabstir/llm-sdk
```

### 3. Install from GitHub

```bash
npm install git+https://github.com/yourusername/fabstir-llm-sdk.git
```

## Environment Setup

Create a `.env` file in your project root:

```bash
# RPC Configuration
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Wallet Configuration
PRIVATE_KEY=0x... # Your wallet private key (keep secure!)

# Contract Addresses (Base Sepolia - January 2025)
CONTRACT_JOB_MARKETPLACE=0xD937c594682Fe74E6e3d06239719805C04BE804A
CONTRACT_NODE_REGISTRY=0x87516C13Ea2f99de598665e14cab64E191A0f8c4
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# S5 Storage Configuration
S5_PORTAL_URL=wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p
# S5 seed is auto-generated from wallet signature

# P2P Configuration (optional)
P2P_BOOTSTRAP_NODES=["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."]
P2P_LISTEN_ADDRESSES=["/ip4/0.0.0.0/tcp/0"]
```

## Quick Start

### Basic SDK Setup

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setupSDK() {
  // 1. Initialize SDK with configuration
  const sdk = new FabstirSDK({
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
    s5PortalUrl: process.env.S5_PORTAL_URL,
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
      usdcToken: process.env.CONTRACT_USDC_TOKEN
    }
  });

  // 2. Authenticate with private key
  const authResult = await sdk.authenticate(process.env.PRIVATE_KEY!);
  console.log('✅ Authenticated as:', authResult.userAddress);
  console.log('   Network:', authResult.network?.name);
  
  // 3. SDK is ready - all managers are now accessible
  return sdk;
}
```

### Create Your First Session

```typescript
async function createFirstSession() {
  const sdk = await setupSDK();
  
  // Get the session manager
  const sessionManager = await sdk.getSessionManager();
  
  // Create an ETH-funded session
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005', // 0.005 ETH
    pricePerToken: 5000,
    duration: 3600, // 1 hour
    hostAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7' // Example host
  });
  
  console.log('✅ Session created!');
  console.log('   Session ID:', session.sessionId);
  console.log('   Job ID:', session.jobId);
  console.log('   Transaction:', session.txHash);
  
  return session;
}
```

## Manager Configuration

The SDK uses 5 specialized managers, each handling specific functionality:

### 1. AuthManager Setup

Handles wallet authentication and S5 seed generation:

```typescript
const authManager = sdk.getAuthManager();

// Check authentication status
if (!authManager.isAuthenticated()) {
  await sdk.authenticate(privateKey);
}

// Access authentication details
const userAddress = authManager.getUserAddress();
const signer = authManager.getSigner();
const s5Seed = authManager.getS5Seed(); // Auto-generated from wallet
```

### 2. PaymentManager Setup

Manages ETH and USDC payments:

```typescript
const paymentManager = sdk.getPaymentManager();

// For ETH payments
const ethJob = await paymentManager.createETHSessionJob(
  hostAddress,
  '0.005',  // ETH amount
  5000,     // price per token
  3600,     // duration
  300       // proof interval
);

// For USDC payments (requires approval)
await paymentManager.approveUSDC(usdcAddress, '100');
const usdcJob = await paymentManager.createUSDCSessionJob(
  hostAddress,
  usdcAddress,
  '100',    // USDC amount
  5000,     // price per token
  3600,     // duration
  300       // proof interval
);
```

### 3. StorageManager Setup

Interfaces with S5 decentralized storage:

```typescript
const storageManager = await sdk.getStorageManager();

// Store conversation data
const cid = await storageManager.storeData(
  'conversation-123',
  {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ],
    timestamp: Date.now()
  }
);

// Retrieve data
const data = await storageManager.retrieveData('conversation-123');
```

### 4. DiscoveryManager Setup

Handles P2P node discovery:

```typescript
const discoveryManager = sdk.getDiscoveryManager();

// Create P2P node
const peerId = await discoveryManager.createNode({
  listen: ['/ip4/0.0.0.0/tcp/0'],
  bootstrap: [] // Add bootstrap nodes for production
});

// Find suitable host
const hostAddress = await discoveryManager.findHost({
  minReputation: 100,
  preferredModels: ['llama-3.2-1b-instruct']
});
```

### 5. SessionManager Setup

Orchestrates complete session workflows:

```typescript
const sessionManager = await sdk.getSessionManager();

// Create session with auto-discovery
const session = await sessionManager.createSession({
  paymentType: 'ETH',
  amount: '0.005',
  hostCriteria: {
    minReputation: 50,
    maxLatency: 500
  }
});

// Submit proof during computation
await sessionManager.submitProof(session.sessionId, proofData);

// Complete session and distribute payments
const completion = await sessionManager.completeSession(session.sessionId);
console.log('Payment distribution:', completion.paymentDistribution);
```

## Contract Setup

### Verify Contract Deployment

The SDK uses deployed contracts on Base Sepolia. Verify they're accessible:

```typescript
import { ethers } from 'ethers';

async function verifyContracts() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL_BASE_SEPOLIA
  );
  
  // Check JobMarketplace
  const jobCode = await provider.getCode(process.env.CONTRACT_JOB_MARKETPLACE!);
  console.log('JobMarketplace deployed:', jobCode !== '0x');
  
  // Check NodeRegistry
  const nodeCode = await provider.getCode(process.env.CONTRACT_NODE_REGISTRY!);
  console.log('NodeRegistry deployed:', nodeCode !== '0x');
  
  // Check USDC Token
  const usdcCode = await provider.getCode(process.env.CONTRACT_USDC_TOKEN!);
  console.log('USDC Token deployed:', usdcCode !== '0x');
}
```

### Current Deployment (January 2025)

- **Network**: Base Sepolia (Chain ID: 84532)
- **JobMarketplace**: `0xD937c594682Fe74E6e3d06239719805C04BE804A`
- **NodeRegistry**: `0x87516C13Ea2f99de598665e14cab64E191A0f8c4`
- **ProofSystem**: `0x2ACcc60893872A499700908889B38C5420CBcFD1`
- **USDC Token**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## S5 Storage Setup

S5 provides decentralized storage for conversations and session data.

### S5 Seed Generation

The S5 seed is automatically generated from your wallet:

```typescript
// This happens internally in AuthManager
const SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
const signature = await signer.signMessage(SEED_MESSAGE);
const s5Seed = deriveS5SeedFromSignature(signature);
```

### S5 Portal Configuration

Default portal: `wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p`

For custom portals:

```typescript
const sdk = new FabstirSDK({
  s5PortalUrl: 'wss://your-custom-portal/s5/p2p'
});
```

## P2P Network Setup

### Bootstrap Nodes

For production P2P connectivity:

```typescript
const discoveryManager = sdk.getDiscoveryManager();

await discoveryManager.createNode({
  listen: ['/ip4/0.0.0.0/tcp/4001'],
  bootstrap: [
    '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg',
    // Add more bootstrap nodes for redundancy
  ]
});
```

### Firewall Configuration

Ensure these ports are open:
- TCP 4001: P2P communication
- TCP 9090: WebSocket connections (if using)

## Testing Your Setup

### 1. Test Authentication

```typescript
async function testAuth() {
  const sdk = new FabstirSDK();
  const result = await sdk.authenticate(process.env.PRIVATE_KEY!);
  
  console.assert(result.userAddress, 'Authentication failed');
  console.assert(result.s5Seed, 'S5 seed generation failed');
  console.log('✅ Authentication test passed');
}
```

### 2. Test Storage

```typescript
async function testStorage() {
  const sdk = await setupSDK();
  const storageManager = await sdk.getStorageManager();
  
  const testData = { test: 'data', timestamp: Date.now() };
  const cid = await storageManager.storeData('test-key', testData);
  
  const retrieved = await storageManager.retrieveData('test-key');
  console.assert(retrieved.test === 'data', 'Storage test failed');
  console.log('✅ Storage test passed');
}
```

### 3. Test Session Creation

```typescript
async function testSession() {
  const sdk = await setupSDK();
  const sessionManager = await sdk.getSessionManager();
  
  try {
    const session = await sessionManager.createSession({
      paymentType: 'ETH',
      amount: '0.005',
      hostAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'
    });
    console.log('✅ Session test passed:', session.sessionId);
  } catch (error) {
    console.error('Session test failed:', error);
  }
}
```

### Run All Tests

```typescript
async function runAllTests() {
  await testAuth();
  await testStorage();
  await testSession();
  console.log('✅ All tests passed!');
}

runAllTests().catch(console.error);
```

## Troubleshooting

### Common Issues

#### "Cannot find module '@fabstir/llm-sdk'"
- Ensure SDK is installed: `npm list @fabstir/llm-sdk`
- For npm link: verify link is active with `npm ls -g --depth=0 --link=true`

#### "Authentication failed"
- Check private key format (should start with 0x)
- Verify private key has no spaces or line breaks
- Ensure wallet has ETH for gas

#### "Insufficient balance"
- Check ETH balance: minimum 0.005 ETH for session + gas
- For USDC: ensure approval transaction completes first
- Verify correct network (Base Sepolia)

#### "Contract call failed"
- Verify RPC URL is correct
- Check contract addresses match deployment
- Ensure you're on Base Sepolia network

#### "S5 storage timeout"
- Check internet connectivity
- Verify S5 portal URL is accessible
- Try alternative portal if available

#### "P2P connection failed"
- Check firewall settings
- Verify bootstrap nodes are running
- Ensure listen addresses are not blocked

### Debug Mode

Enable debug logging:

```typescript
const sdk = new FabstirSDK({
  // ... config
  debug: true
});

// Or set environment variable
process.env.DEBUG = 'fabstir:*';
```

## Next Steps

1. **Explore Examples**
   - [Basic Usage](../examples/basic-usage.ts)
   - [Advanced Usage](../examples/advanced-usage.ts)
   - [UI Integration](../examples/ui-integration.ts)

2. **Read Documentation**
   - [SDK API Reference](SDK_API.md)
   - [Quick Reference](SDK_QUICK_REFERENCE.md)
   - [Integration Testing](INTEGRATED_TESTING.md)

3. **Join Community**
   - Discord: [discord.gg/fabstir](https://discord.gg/fabstir)
   - GitHub: [github.com/fabstir](https://github.com/fabstir)

4. **Deploy to Production**
   - Switch to Base Mainnet
   - Use production bootstrap nodes
   - Implement proper key management
   - Add monitoring and logging

## Support

- 📖 [Full Documentation](https://docs.fabstir.com)
- 💬 [Discord Community](https://discord.gg/fabstir)
- 🐛 [Issue Tracker](https://github.com/fabstir/llm-sdk/issues)
- 📧 Email: support@fabstir.com

---

*Last updated: January 2025 - Manager-based Architecture v2.0*