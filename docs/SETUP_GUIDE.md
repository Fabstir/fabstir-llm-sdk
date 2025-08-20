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

- **Base Sepolia Network Setup**:
  1. Add Base Sepolia to MetaMask:
     - Network Name: Base Sepolia
     - RPC URL: https://sepolia.base.org
     - Chain ID: 84532
     - Currency Symbol: ETH
     - Block Explorer: https://sepolia.basescan.org

- **Required Tokens**:
  - **Base Sepolia ETH** for gas fees
    - Get from [Base Sepolia Faucet](https://faucet.quicknode.com/base/sepolia)
    - You'll need at least 0.1 ETH for testing
  - **USDC** for job payments (primary payment method)
    - Get test USDC from the marketplace faucet (see below)
  - **FAB** tokens (optional, for governance/staking only)
    - NOT used for job payments anymore

## Installation

### 1. Install the SDK

Using npm:
```bash
npm install @fabstir/llm-marketplace-sdk
```

Using pnpm (recommended):
```bash
pnpm add @fabstir/llm-marketplace-sdk
```

Using yarn:
```bash
yarn add @fabstir/llm-marketplace-sdk
```

### 2. Install Required Dependencies

The SDK requires these peer dependencies:

```bash
pnpm add ethers@^6.0.0
```

Note: The SDK uses ethers v6, not v5. Make sure your project is compatible.

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
NETWORK=base-sepolia

# Base Sepolia Contract Addresses (Deployed)
JOB_MARKETPLACE_ADDRESS=0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6
PAYMENT_ESCROW_ADDRESS=0x4B7f... # Check latest deployment
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e # Base Sepolia USDC
FAB_ADDRESS=0x... # FAB token (governance only, not for payments)

# RPC Endpoint
RPC_URL=https://sepolia.base.org

# Your wallet private key (keep secure!)
PRIVATE_KEY=0x...

# Optional: Debug Mode
DEBUG=true
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
import { FabstirLLMSDK } from '@fabstir/llm-marketplace-sdk';
import { ethers } from 'ethers';

// Initialize SDK
const sdk = new FabstirLLMSDK({
  network: 'base-sepolia',
  
  // Contract addresses
  contracts: {
    jobMarketplace: process.env.JOB_MARKETPLACE_ADDRESS!,
    paymentEscrow: process.env.PAYMENT_ESCROW_ADDRESS!,
    usdc: process.env.USDC_ADDRESS!,
    fab: process.env.FAB_ADDRESS!, // Only for governance
  },
  
  // RPC configuration
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  
  // Optional settings
  debug: process.env.DEBUG === 'true',
});
```

### Connect Wallet

```typescript
// For browser environment with MetaMask
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// For Node.js with private key
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Initialize SDK with signer
const sdk = new FabstirLLMSDK({
  signer: signer, // or wallet for Node.js
  network: 'base-sepolia',
  contracts: {
    jobMarketplace: process.env.JOB_MARKETPLACE_ADDRESS!,
    paymentEscrow: process.env.PAYMENT_ESCROW_ADDRESS!,
    usdc: process.env.USDC_ADDRESS!,
  },
  rpcUrl: process.env.RPC_URL,
});

const address = await signer.getAddress();
console.log('Connected address:', address);
```

## First Job Submission with USDC

### 1. Get Test USDC

```typescript
// Check your USDC balance
const usdcContract = new ethers.Contract(
  process.env.USDC_ADDRESS!,
  ['function balanceOf(address) view returns (uint256)'],
  provider
);

const balance = await usdcContract.balanceOf(address);
console.log('USDC Balance:', ethers.formatUnits(balance, 6), 'USDC');

// If you need test USDC, get from faucet or DEX
// Note: Base Sepolia USDC faucets may vary
```

### 2. Approve USDC Spending

```typescript
// Check current USDC allowance
const currentAllowance = await sdk.checkUSDCAllowance(address);
console.log('Current USDC allowance:', ethers.formatUnits(currentAllowance, 6));

// Approve USDC if needed (10 USDC for testing)
const amountToApprove = ethers.parseUnits('10', 6); // 10 USDC

if (currentAllowance < amountToApprove) {
  console.log('Approving USDC...');
  const approveTx = await sdk.approveUSDC(amountToApprove);
  await approveTx.wait();
  console.log('USDC approved!');
}
```

### 3. Submit Your First Job with USDC Payment

```typescript
try {
  // Prepare job details (field order matters!)
  const jobDetails = {
    requester: address,
    model: 'gpt-4',
    prompt: 'Write a haiku about blockchain technology',
    offerPrice: ethers.parseUnits('5', 6), // 5 USDC
    maxTokens: 100n,
    seed: 0n
  };
  
  const requirements = {
    trustedExecution: false
  };
  
  // Submit job with USDC payment
  console.log('Submitting job with USDC payment...');
  const tx = await sdk.postJobWithToken(
    jobDetails,
    requirements,
    process.env.USDC_ADDRESS!,
    ethers.parseUnits('5', 6) // 5 USDC payment
  );
  
  console.log('Transaction hash:', tx.hash);
  const receipt = await tx.wait();
  
  // Extract job ID from events
  const jobId = receipt.logs[0].topics[1]; // Adjust based on actual event
  console.log('Job submitted successfully!');
  console.log('Job ID:', jobId);
  console.log('Payment: 5 USDC escrowed');
  console.log('\nWaiting for host to claim and process...');
  
  // Payment flow:
  // 1. USDC transferred to PaymentEscrow
  // 2. Host claims and processes job
  // 3. On completion: 90% (4.5 USDC) to host, 10% (0.5 USDC) to treasury
  
} catch (error) {
  console.error('Job submission failed:', error);
  
  // Common errors:
  // - "Insufficient allowance": Need to approve USDC first
  // - "Insufficient balance": Need more USDC
  // - "Invalid struct": Check field order in jobDetails
}
```

### 4. Submit Job with ETH Payment (Alternative)

```typescript
// ETH payments don't require approval
try {
  const jobDetails = {
    requester: address,
    model: 'gpt-4',
    prompt: 'Explain Web3 in simple terms',
    offerPrice: ethers.parseEther('0.001'), // 0.001 ETH
    maxTokens: 200n,
    seed: 0n
  };
  
  const requirements = {
    trustedExecution: false
  };
  
  // Submit with ETH (use AddressZero for ETH)
  const tx = await sdk.postJobWithToken(
    jobDetails,
    requirements,
    ethers.ZeroAddress, // ETH payment
    ethers.parseEther('0.001')
  );
  
  await tx.wait();
  console.log('Job submitted with ETH payment!');
  
} catch (error) {
  console.error('ETH payment failed:', error);
}
```

## Testing Your Setup

### 1. Run SDK Tests

Create `test-setup.ts`:

```typescript
import { FabstirLLMSDK } from '@fabstir/llm-marketplace-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testSetup() {
  console.log('🧪 Testing Fabstir LLM SDK Setup...\n');
  
  try {
    // 1. Setup provider and wallet
    console.log('1️⃣ Setting up provider...');
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const address = await wallet.getAddress();
    console.log('✅ Wallet connected:', address, '\n');
    
    // 2. Initialize SDK
    console.log('2️⃣ Initializing SDK...');
    const sdk = new FabstirLLMSDK({
      signer: wallet,
      network: 'base-sepolia',
      contracts: {
        jobMarketplace: process.env.JOB_MARKETPLACE_ADDRESS!,
        paymentEscrow: process.env.PAYMENT_ESCROW_ADDRESS!,
        usdc: process.env.USDC_ADDRESS!,
      },
      rpcUrl: process.env.RPC_URL,
      debug: true,
    });
    console.log('✅ SDK initialized\n');
    
    // 3. Check USDC balance
    console.log('3️⃣ Checking USDC balance...');
    const usdcContract = new ethers.Contract(
      process.env.USDC_ADDRESS!,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const balance = await usdcContract.balanceOf(address);
    console.log(`✅ USDC Balance: ${ethers.formatUnits(balance, 6)} USDC\n`);
    
    // 4. Check USDC allowance
    console.log('4️⃣ Checking USDC allowance...');
    const allowance = await sdk.checkUSDCAllowance(address);
    console.log(`✅ Current allowance: ${ethers.formatUnits(allowance, 6)} USDC\n`);
    
    // 5. Test job submission with USDC
    console.log('5️⃣ Testing job submission with USDC...');
    
    // Approve if needed
    if (allowance < ethers.parseUnits('1', 6)) {
      console.log('   Approving USDC...');
      const approveTx = await sdk.approveUSDC(ethers.parseUnits('10', 6));
      await approveTx.wait();
      console.log('   ✅ USDC approved');
    }
    
    // Submit job
    const jobDetails = {
      requester: address,
      model: 'gpt-4',
      prompt: 'Say "Hello, Fabstir!"',
      offerPrice: ethers.parseUnits('1', 6), // 1 USDC
      maxTokens: 10n,
      seed: 0n
    };
    
    const tx = await sdk.postJobWithToken(
      jobDetails,
      { trustedExecution: false },
      process.env.USDC_ADDRESS!,
      ethers.parseUnits('1', 6)
    );
    
    const receipt = await tx.wait();
    console.log(`✅ Job submitted! Tx: ${receipt.hash}\n`);
    
    console.log('🎉 All tests passed! Your setup is working correctly.');
    console.log('\n📝 Note: FAB tokens are NOT used for payments, only USDC/ETH');
    
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
// Verify contract addresses
console.log('Contract Addresses:');
console.log('  JobMarketplace:', process.env.JOB_MARKETPLACE_ADDRESS);
console.log('  PaymentEscrow:', process.env.PAYMENT_ESCROW_ADDRESS);
console.log('  USDC:', process.env.USDC_ADDRESS);
console.log('  FAB (governance only):', process.env.FAB_ADDRESS);

// Check balances
const ethBalance = await provider.getBalance(address);
console.log('ETH Balance:', ethers.formatEther(ethBalance), 'ETH');

const usdcBalance = await usdcContract.balanceOf(address);
console.log('USDC Balance:', ethers.formatUnits(usdcBalance, 6), 'USDC');
```

### 3. Important Payment Notes

```typescript
// IMPORTANT: Payment Token Changes
// - FAB tokens are NO LONGER used for job payments
// - Use USDC (recommended) or ETH for all job payments
// - FAB is only for governance voting and node staking

// Correct payment flow:
// 1. User approves USDC (one-time or per-job)
// 2. User submits job with USDC payment
// 3. USDC goes to PaymentEscrow contract
// 4. Host claims and processes job
// 5. Payment released: 90% to host, 10% to treasury

// If you see errors about FAB payments, update your code!
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
// Common transaction errors and solutions:

// Error: "Insufficient allowance"
// Solution: Approve USDC first
await sdk.approveUSDC(requiredAmount);

// Error: "Invalid struct"
// Solution: Check field order matches Solidity exactly
const jobDetails = {
  requester: address,      // Field 1
  model: 'gpt-4',          // Field 2
  prompt: 'test',          // Field 3
  offerPrice: amount,      // Field 4
  maxTokens: 100n,         // Field 5
  seed: 0n                 // Field 6
};

// Error: "FAB payment failed"
// Solution: FAB is not for payments! Use USDC or ETH
const tx = await sdk.postJobWithToken(
  jobDetails,
  requirements,
  USDC_ADDRESS, // NOT FAB_ADDRESS!
  amount
);
```

**USDC Issues**
```typescript
// No USDC balance on Base Sepolia?
// 1. Bridge USDC from Base Sepolia faucet
// 2. Or swap ETH for USDC on a Base Sepolia DEX
// 3. Or ask in Discord for test USDC
```

For more help, see the [API Documentation](API.md) or ask in [Discord](https://discord.gg/fabstir).