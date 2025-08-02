# Fabstir LLM SDK Setup Guide

This guide walks you through setting up the Fabstir LLM SDK from scratch, including prerequisites, installation, configuration, and your first job submission.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Contract Deployment](#contract-deployment)
- [Bootstrap Node Setup](#bootstrap-node-setup)
- [SDK Configuration](#sdk-configuration)
- [First Job Submission](#first-job-submission)
- [Testing Your Setup](#testing-your-setup)
- [Next Steps](#next-steps)

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

- **Node.js** v16.0 or higher
  ```bash
  node --version  # Should output v16.0.0 or higher
  ```

- **npm** or **pnpm** (recommended)
  ```bash
  # Install pnpm if you don't have it
  npm install -g pnpm
  ```

- **Git** for cloning repositories
  ```bash
  git --version
  ```

### Blockchain Requirements

- **Ethereum Wallet** (one of the following):
  - [MetaMask](https://metamask.io/) browser extension
  - [WalletConnect](https://walletconnect.com/) compatible wallet
  - Hardware wallet (Ledger, Trezor) with Web3 provider

- **Base Sepolia ETH** for gas fees
  - Get test ETH from [Base Sepolia Faucet](https://faucet.quicknode.com/base/sepolia)
  - You'll need at least 0.1 ETH for testing

## Installation

### 1. Install the SDK

Using npm:
```bash
npm install @fabstir/llm-sdk
```

Using pnpm (recommended):
```bash
pnpm add @fabstir/llm-sdk
```

Using yarn:
```bash
yarn add @fabstir/llm-sdk
```

### 2. Install Required Dependencies

The SDK requires these peer dependencies:

```bash
pnpm add ethers@^5.7.2
```

### 3. TypeScript Setup (Optional)

For TypeScript projects, install type definitions:

```bash
pnpm add -D typescript @types/node
```

Create or update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "types": ["node"]
  }
}
```

## Environment Setup

### 1. Create Environment Variables

Create a `.env` file in your project root:

```bash
# Network Configuration
FABSTIR_NETWORK=base-sepolia
FABSTIR_MODE=production

# Contract Addresses (Base Sepolia)
FABSTIR_JOB_MARKETPLACE=0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1
FABSTIR_PAYMENT_ESCROW=0x12892b2fD2e484B88C19568E7D63bB3b9fE4dB02
FABSTIR_NODE_REGISTRY=0x8Ba7968C30496aB344bc9e7595f5b9A185E3eD89

# P2P Bootstrap Nodes
FABSTIR_BOOTSTRAP_NODES="/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg,/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V"

# Optional: RPC Endpoint (if not using default)
FABSTIR_RPC_URL=https://base-sepolia.public.blastapi.io

# Optional: Debug Mode
FABSTIR_DEBUG=true
```

### 2. Load Environment Variables

Install dotenv:
```bash
pnpm add dotenv
```

Load in your application:
```typescript
import dotenv from 'dotenv';
dotenv.config();
```

## Contract Deployment

If you need to deploy your own contracts (optional for testing):

### 1. Clone Contracts Repository

```bash
git clone https://github.com/fabstir/llm-contracts
cd llm-contracts
pnpm install
```

### 2. Configure Deployment

Create `hardhat.config.ts`:

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    baseSepolia: {
      url: process.env.RPC_URL || "https://base-sepolia.public.blastapi.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
```

### 3. Deploy Contracts

```bash
# Deploy all contracts
npx hardhat run scripts/deploy.ts --network baseSepolia

# Output will show contract addresses
# JobMarketplace deployed to: 0x...
# PaymentEscrow deployed to: 0x...
# NodeRegistry deployed to: 0x...
```

### 4. Verify Contracts (Optional)

```bash
npx hardhat verify --network baseSepolia CONTRACT_ADDRESS
```

## Bootstrap Node Setup

To run your own bootstrap node:

### 1. Install Fabstir Node

```bash
npm install -g @fabstir/node
```

### 2. Initialize Node

```bash
fabstir-node init --name my-bootstrap-node
```

This creates:
- Node identity keypair
- Configuration file
- Data directory

### 3. Configure Bootstrap Node

Edit `~/.fabstir/config.yaml`:

```yaml
# Node Configuration
identity:
  peer_id: 12D3KooW...  # Auto-generated
  private_key: ...       # Keep secret!

# Network Settings
network:
  listen_addresses:
    - /ip4/0.0.0.0/tcp/4001
    - /ip4/0.0.0.0/tcp/4002/ws
  
  announce_addresses:
    - /ip4/YOUR_PUBLIC_IP/tcp/4001
    - /ip4/YOUR_PUBLIC_IP/tcp/4002/ws

# Bootstrap Settings
bootstrap:
  enabled: true
  peers: []  # Empty for first bootstrap node

# Discovery
discovery:
  dht: true
  mdns: false  # Disable for public nodes

# API
api:
  enabled: true
  address: 0.0.0.0
  port: 5001
```

### 4. Start Bootstrap Node

```bash
# Start in foreground
fabstir-node start

# Or run as daemon
fabstir-node daemon
```

### 5. Get Node Multiaddr

```bash
fabstir-node id

# Output:
# PeerID: 12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg
# Addresses:
# - /ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg
```

## SDK Configuration

### Basic Configuration

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

// Initialize SDK
const sdk = new FabstirSDK({
  mode: process.env.FABSTIR_MODE as 'mock' | 'production',
  network: process.env.FABSTIR_NETWORK,
  
  // Contract addresses
  contracts: {
    jobMarketplace: process.env.FABSTIR_JOB_MARKETPLACE,
    paymentEscrow: process.env.FABSTIR_PAYMENT_ESCROW,
    nodeRegistry: process.env.FABSTIR_NODE_REGISTRY,
  },
  
  // P2P configuration
  p2pConfig: {
    bootstrapNodes: process.env.FABSTIR_BOOTSTRAP_NODES?.split(',') || [],
    enableDHT: true,
    enableMDNS: true,
  },
  
  // Optional settings
  debug: process.env.FABSTIR_DEBUG === 'true',
});
```

### Connect Wallet

```typescript
// For browser environment with MetaMask
const provider = new ethers.providers.Web3Provider(window.ethereum);
await provider.send("eth_requestAccounts", []);

// For Node.js with private key
const provider = new ethers.providers.JsonRpcProvider(process.env.FABSTIR_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Connect SDK
await sdk.connect(provider);

console.log('Connected to:', await sdk.getNetwork());
console.log('Address:', await sdk.getAddress());
```

## First Job Submission

### 1. Check System Health

```typescript
// Verify everything is working
const health = await sdk.getSystemHealthReport();

console.log('System Status:', health.status);
console.log('P2P Connected:', health.p2p.status);
console.log('Blockchain Connected:', health.blockchain.status);

if (health.status !== 'healthy') {
  console.error('Issues detected:', health.issues);
  // Address issues before proceeding
}
```

### 2. Discover Available Nodes

```typescript
// Find nodes that support your desired model
const nodes = await sdk.discoverNodes({
  modelId: 'llama-3.2-1b-instruct',
  maxLatency: 1000,  // Max 1 second latency
  minReputation: 80, // Minimum reputation score
});

console.log(`Found ${nodes.length} suitable nodes:`);
nodes.forEach(node => {
  console.log(`- ${node.peerId}: ${node.capabilities.models.join(', ')}`);
  console.log(`  Price: ${node.capabilities.pricePerToken} wei/token`);
  console.log(`  Latency: ${node.latency}ms`);
});
```

### 3. Submit Your First Job

```typescript
try {
  // Submit job with automatic negotiation
  const result = await sdk.submitJobWithNegotiation({
    prompt: "Write a haiku about blockchain technology",
    modelId: "llama-3.2-1b-instruct",
    maxTokens: 50,
    temperature: 0.7,
    stream: true,  // Enable streaming
  });

  console.log('Job submitted!');
  console.log('Job ID:', result.jobId);
  console.log('Selected Node:', result.selectedNode);
  console.log('Estimated Cost:', ethers.utils.formatEther(result.negotiatedPrice));
  
  // Handle streaming response
  if (result.stream) {
    console.log('\nResponse:');
    
    result.stream.on('token', (token) => {
      process.stdout.write(token.content);
    });
    
    result.stream.on('end', (summary) => {
      console.log('\n\nCompleted!');
      console.log('Total tokens:', summary.totalTokens);
      console.log('Duration:', summary.duration, 'ms');
    });
    
    result.stream.on('error', (error) => {
      console.error('Stream error:', error);
    });
  }
} catch (error) {
  console.error('Job submission failed:', error);
}
```

### 4. Monitor Job Progress

```typescript
// For non-streaming jobs, poll for status
const jobId = result.jobId;

const checkStatus = async () => {
  const status = await sdk.getJobStatus(jobId);
  console.log('Job Status:', status.status);
  
  if (status.status === 'COMPLETED') {
    const result = await sdk.getJobResult(jobId);
    console.log('Result:', result.response);
    console.log('Tokens used:', result.tokensUsed);
  } else if (status.status === 'FAILED') {
    console.error('Job failed:', status.error);
  } else {
    // Check again in 2 seconds
    setTimeout(checkStatus, 2000);
  }
};

// Start monitoring
checkStatus();
```

## Testing Your Setup

### 1. Run SDK Tests

Create `test-setup.ts`:

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testSetup() {
  console.log('🧪 Testing Fabstir SDK Setup...\n');
  
  try {
    // 1. Initialize SDK
    console.log('1️⃣ Initializing SDK...');
    const sdk = new FabstirSDK({
      mode: 'production',
      network: 'base-sepolia',
      p2pConfig: {
        bootstrapNodes: process.env.FABSTIR_BOOTSTRAP_NODES?.split(',') || [],
      },
      debug: true,
    });
    console.log('✅ SDK initialized\n');
    
    // 2. Connect wallet
    console.log('2️⃣ Connecting wallet...');
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.FABSTIR_RPC_URL
    );
    await sdk.connect(provider);
    console.log('✅ Wallet connected\n');
    
    // 3. Check health
    console.log('3️⃣ Checking system health...');
    const health = await sdk.getSystemHealthReport();
    console.log(`✅ System status: ${health.status}`);
    console.log(`   P2P: ${health.p2p.status}`);
    console.log(`   Blockchain: ${health.blockchain.status}\n`);
    
    // 4. Discover nodes
    console.log('4️⃣ Discovering nodes...');
    const nodes = await sdk.discoverNodes({
      modelId: 'llama-3.2-1b-instruct',
    });
    console.log(`✅ Found ${nodes.length} nodes\n`);
    
    // 5. Test job submission
    console.log('5️⃣ Testing job submission...');
    const result = await sdk.submitJobWithNegotiation({
      prompt: "Say 'Hello, Fabstir!'",
      modelId: "llama-3.2-1b-instruct",
      maxTokens: 10,
    });
    console.log(`✅ Job ${result.jobId} submitted to ${result.selectedNode}\n`);
    
    console.log('🎉 All tests passed! Your setup is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSetup();
```

Run the test:

```bash
npx ts-node test-setup.ts
```

### 2. Verify Contract Connections

```typescript
// Test contract interactions
const contracts = await sdk.getContractAddresses();
console.log('Contract Addresses:', contracts);

// Check your balance
const balance = await sdk.getBalance();
console.log('Wallet Balance:', ethers.utils.formatEther(balance), 'ETH');
```

### 3. Test Mock Mode

```typescript
// Test with mock mode for development
const mockSdk = new FabstirSDK({
  mode: 'mock',
});

await mockSdk.connect(provider);

const mockJob = await mockSdk.submitJob({
  prompt: "Test mock response",
  modelId: "llama-3.2-1b-instruct",
  maxTokens: 50,
});

console.log('Mock job:', mockJob);
```

## Next Steps

Now that your SDK is set up and working:

1. **Explore the Examples**
   - Check the [examples/](../examples/) directory
   - Try different job types and configurations

2. **Read the API Documentation**
   - [API Reference](API.md) for all available methods
   - [Configuration Guide](CONFIGURATION.md) for advanced options

3. **Join the Community**
   - [Discord](https://discord.gg/fabstir) for support
   - [GitHub Discussions](https://github.com/fabstir/llm-sdk/discussions) for Q&A

4. **Build Your Application**
   - Integrate the SDK into your project
   - Implement error handling and retries
   - Add monitoring and logging

5. **Deploy to Production**
   - Set up production bootstrap nodes
   - Configure proper security
   - Monitor performance and costs

## Troubleshooting

### Common Issues

**Connection Timeout**
```typescript
// Increase timeouts
const sdk = new FabstirSDK({
  p2pConfig: {
    dialTimeout: 60000,  // 60 seconds
    requestTimeout: 120000, // 120 seconds
  }
});
```

**No Nodes Found**
```typescript
// Force refresh discovery
const nodes = await sdk.discoverNodes({
  modelId: 'llama-3.2-1b-instruct',
  forceRefresh: true,
});
```

**Transaction Failures**
```typescript
// Add retry logic
const result = await sdk.submitJobWithRetry(
  jobParams,
  {
    maxRetries: 3,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt} after error:`, error.message);
    }
  }
);
```

For more help, see the [P2P Configuration Guide](P2P_CONFIGURATION.md#troubleshooting).