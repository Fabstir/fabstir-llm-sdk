# Configuration Reference

This document explains how the Host CLI is configured using environment variables and SDK initialization. The CLI uses **environment-based configuration** (not JSON config files).

## Table of Contents
- [Overview](#overview)
- [Environment Variables](#environment-variables)
- [SDK Configuration](#sdk-configuration)
- [Network Selection](#network-selection)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Host CLI configuration system is based on:

1. **Environment Variables** (`.env.test`) - Contract addresses and RPC URLs
2. **SDK Initialization** - Automatic config creation from environment
3. **Command-Line Options** - Runtime parameters (private key, RPC override)

**Key Point**: There are **no JSON config files**. Configuration comes from environment variables loaded by the SDK.

## Environment Variables

### Location

Environment variables must be defined in `.env.test` at the repository root:

```bash
/workspace/
├── .env.test          # ← Configuration source of truth
├── packages/
│   ├── host-cli/      # CLI reads from .env.test
│   └── sdk-core/      # SDK reads from .env.test
```

### Required Variables

#### Contract Addresses

**CRITICAL**: These addresses are managed by the project owner only. Never modify `.env.test`.

```bash
# Core Contracts (Fabstir)
CONTRACT_JOB_MARKETPLACE=0xdEa1B47872C27458Bb7331Ade99099761C4944Dc
CONTRACT_NODE_REGISTRY=0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E

# Token Contracts
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

**Note**: These are the only current contract addresses. Any hardcoded addresses elsewhere are bugs.

#### Network Configuration

```bash
# RPC Endpoints
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
RPC_URL_BASE_MAINNET=https://mainnet.base.org

# Default Network
DEFAULT_CHAIN=baseSepolia
CHAIN_ID=84532
```

#### Optional Variables

```bash
# S5 Storage Configuration (for conversation persistence)
S5_PORTAL_URL=https://s5.cx
S5_SEED_PHRASE=your-seed-phrase-here

# Base Protocol Contracts (NOT Fabstir contracts - Base infrastructure)
BASE_CONTRACT_SPEND_PERMISSION_MANAGER=0xf85210B21cC50302F477BA56686d2019dC9b67Ad
```

### Test Account Variables

**For Development/Testing Only**:

```bash
# Deployer Account (Index 20 - Owner Use Only)
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_ADDRESS=0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11

# User Test Accounts
TEST_USER_1_PRIVATE_KEY=0x...
TEST_USER_1_ADDRESS=0x8D642988E3e7b6DB15b6058461d5563835b04bF6

TEST_USER_2_PRIVATE_KEY=0x...
TEST_USER_2_ADDRESS=0xf3A15B584e8Baf530063f97a82dD088Bce0Be659

# Host Test Accounts
TEST_HOST_1_PRIVATE_KEY=0x...
TEST_HOST_1_ADDRESS=0x4594F755F593B517Bb3194F4DeC20C48a3f04504
TEST_HOST_1_URL=http://localhost:8083

TEST_HOST_2_PRIVATE_KEY=0x...
TEST_HOST_2_ADDRESS=0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c

# Treasury
TEST_TREASURY_ACCOUNT=0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11
```

**WARNING**: Never commit `.env` or `.env.test` files to Git! These contain sensitive test credentials.

## SDK Configuration

### How It Works

The SDK automatically reads environment variables and creates configuration:

```typescript
// packages/host-cli/src/sdk/config.ts

export function createSDKConfig(network: 'base-mainnet' | 'base-sepolia'): SDKConfig {
  // Validate required environment variables
  const requiredVars = [
    'CONTRACT_JOB_MARKETPLACE',
    'CONTRACT_NODE_REGISTRY',
    'CONTRACT_PROOF_SYSTEM',
    'CONTRACT_HOST_EARNINGS',
    'CONTRACT_FAB_TOKEN',
    'CONTRACT_USDC_TOKEN'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  // Get RPC URL based on network
  const rpcUrl = network === 'base-mainnet'
    ? process.env.RPC_URL_BASE_MAINNET
    : process.env.RPC_URL_BASE_SEPOLIA;

  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for network: ${network}`);
  }

  // Get chain ID based on network
  const chainId = network === 'base-mainnet' ? 8453 : 84532;

  return {
    chainId,
    rpcUrl,
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
      fabToken: process.env.CONTRACT_FAB_TOKEN!,
      usdcToken: process.env.CONTRACT_USDC_TOKEN!,
      modelRegistry: process.env.CONTRACT_MODEL_REGISTRY || process.env.CONTRACT_JOB_MARKETPLACE!
    },
    s5Config: {
      portalUrl: process.env.S5_PORTAL_URL || 'https://s5.cx',
      seedPhrase: process.env.S5_SEED_PHRASE
    },
    mode: 'production'
  };
}
```

### SDK Config Structure

The resulting `SDKConfig` object:

```typescript
interface SDKConfig {
  chainId: number;                    // 84532 (Base Sepolia) or 8453 (Base Mainnet)
  rpcUrl: string;                     // RPC endpoint URL
  contractAddresses: {
    jobMarketplace: string;           // Main marketplace contract
    nodeRegistry: string;             // Host registry contract
    proofSystem: string;              // Proof verification contract
    hostEarnings: string;             // Earnings management contract
    fabToken: string;                 // FAB token address
    usdcToken: string;                // USDC token address
    modelRegistry: string;            // Model governance contract
  };
  s5Config?: {
    portalUrl?: string;               // S5 portal URL
    seedPhrase?: string;              // S5 seed phrase for storage
  };
  mode?: 'production' | 'development'; // Always 'production' for Host CLI
}
```

## Network Selection

### Supported Networks

#### Base Sepolia (Testnet)

```bash
Network: baseSepolia
Chain ID: 84532
RPC URL: https://base-sepolia.g.alchemy.com/v2/...
Explorer: https://sepolia.basescan.org
Native Token: ETH (testnet)
```

**Use For**:
- Development
- Testing
- Pre-MVP deployments

**Initialize**:
```typescript
await initializeSDK('base-sepolia');
```

#### Base Mainnet (Production)

```bash
Network: base (Base L2)
Chain ID: 8453
RPC URL: https://mainnet.base.org
Explorer: https://basescan.org
Native Token: ETH
```

**Use For**:
- Production deployments (post-MVP)

**Initialize**:
```typescript
await initializeSDK('base-mainnet');
```

### Command-Line Network Override

Most commands use Base Sepolia by default, but you can override the RPC URL:

```bash
# Use default (from .env.test)
pnpm host info --private-key 0x...

# Override RPC URL
pnpm host info \
  --private-key 0x... \
  --rpc-url https://custom-rpc.example.com
```

## Configuration Flow

### Initialization Sequence

```
1. Command Execution
   ↓
2. initializeSDK('base-sepolia')
   ↓
3. createSDKConfig(network)
   ↓
4. Read environment variables from .env.test
   ↓
5. Validate required variables exist
   ↓
6. Create SDKConfig object
   ↓
7. new FabstirSDKCore(config)
   ↓
8. SDK initialized and ready
```

### Example: register Command

```typescript
// src/commands/register.ts

export function registerRegisterCommand(program: Command) {
  program
    .command('register')
    .requiredOption('--private-key <key>', 'Private key')
    .requiredOption('--rpc-url <url>', 'RPC URL')
    .option('--stake <amount>', 'Stake amount', '1000')
    .action(async (options) => {
      // 1. Initialize SDK (reads .env.test)
      await initializeSDK('base-sepolia');

      // 2. Authenticate with private key
      await authenticateSDK(options.privateKey);

      // 3. Get managers (uses config from step 1)
      const hostManager = getHostManager();
      const paymentManager = getPaymentManager();

      // 4. Register host (SDK uses correct contract addresses)
      const txHash = await hostManager.registerHost(
        ethers.parseUnits(options.stake, 18),
        url,
        models
      );

      console.log(`✓ Registered: ${txHash}`);
    });
}
```

## Security Best Practices

### 1. Never Commit `.env.test`

```bash
# .gitignore (should include)
.env
.env.test
.env.local
.env*.local
```

### 2. Separate Test and Production Credentials

```bash
# Development/Testing (.env.test)
TEST_HOST_1_PRIVATE_KEY=0x...  # Testnet credentials
RPC_URL_BASE_SEPOLIA=https://...

# Production (.env.production - NOT IN REPO)
PRODUCTION_PRIVATE_KEY=0x...   # Real credentials
RPC_URL_BASE_MAINNET=https://...
```

### 3. Use Environment-Specific Files

```bash
# Development
.env.test         # Testnet addresses, test accounts

# CI/CD
.env.ci           # CI-specific config

# Production (never commit)
.env.production   # Mainnet addresses, real keys
```

### 4. Limit Private Key Exposure

```bash
# DON'T store in .env
PRIVATE_KEY=0x123...  # ❌ Dangerous

# DO use secure key management
# - Hardware wallet
# - Keystore file (encrypted)
# - AWS Secrets Manager
# - Environment variable at runtime
```

### 5. Validate Contract Addresses

Never use hardcoded addresses:

```typescript
// ❌ WRONG - Hardcoded address
const jobMarketplace = '0x1234...';

// ✅ CORRECT - From environment via SDK
const sdk = await initializeSDK('base-sepolia');
const config = sdk.config;
const jobMarketplace = config.contractAddresses.jobMarketplace;
```

## Troubleshooting

### Error: "Missing required environment variable"

**Problem**: Required contract address not found in `.env.test`

**Solution**:
1. Verify `.env.test` exists at repository root
2. Check that all `CONTRACT_*` variables are defined
3. Restart your terminal/IDE to reload environment

```bash
# Check .env.test exists
ls -la /workspace/.env.test

# Verify variables are loaded
node -e "require('dotenv').config({path:'.env.test'}); console.log(process.env.CONTRACT_JOB_MARKETPLACE)"
```

### Error: "SDK not initialized"

**Problem**: SDK methods called before initialization

**Solution**: Always initialize SDK first:

```typescript
// ❌ WRONG - Missing initialization
const manager = getHostManager(); // Error!

// ✅ CORRECT - Initialize first
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const manager = getHostManager(); // Works!
```

### Error: "Wrong network. Expected chainId 84532, got 1"

**Problem**: RPC URL points to wrong network

**Solution**: Verify RPC URL matches network:

```bash
# For Base Sepolia (chainId 84532)
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/...

# For Ethereum Mainnet (chainId 1)
# This is WRONG for Base - don't use
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
```

### Error: "Contract address not found"

**Problem**: `.env.test` not in correct location

**Solution**: Ensure `.env.test` is at repository root:

```bash
/workspace/.env.test           # ✅ Correct
/workspace/packages/host-cli/.env.test  # ❌ Wrong location
```

### Contract Addresses Changed

**Problem**: Contracts redeployed, addresses outdated

**Solution**:
1. **DO NOT** modify `.env.test` yourself
2. Contact project owner for updated addresses
3. Wait for `.env.test` update from owner
4. Pull latest changes

```bash
# Get latest contract addresses
git pull origin main
# .env.test will be updated by owner
```

## Advanced Configuration

### Custom RPC Provider

For development, you may want to use a custom RPC provider:

```bash
# .env.test (or override via --rpc-url)
RPC_URL_BASE_SEPOLIA=https://my-custom-node.example.com
```

Commands will use this RPC:
```bash
pnpm host info --private-key 0x...
# Uses RPC_URL_BASE_SEPOLIA from .env.test
```

Or override per-command:
```bash
pnpm host info \
  --private-key 0x... \
  --rpc-url https://another-rpc.example.com
```

### S5 Storage Configuration

For conversation persistence (optional):

```bash
# .env.test
S5_PORTAL_URL=https://s5.cx
S5_SEED_PHRASE="your seed phrase here"
```

If not set, storage features will be disabled but core functionality works.

### Base Account Kit (Smart Wallets)

For gasless transactions using Base Account Kit:

```bash
# .env.test
BASE_CONTRACT_SPEND_PERMISSION_MANAGER=0xf85210B21cC50302F477BA56686d2019dC9b67Ad
```

**Note**: This is a Base protocol contract, NOT a Fabstir contract.

## Configuration Validation

### Manual Validation

Check if configuration is valid:

```bash
cd packages/host-cli

# Test SDK initialization
node -e "
const { initializeSDK } = require('./dist/sdk/client.js');
initializeSDK('base-sepolia')
  .then(() => console.log('✓ Configuration valid'))
  .catch(err => console.error('✗ Configuration error:', err.message));
"
```

### Automated Validation

Run configuration tests:

```bash
pnpm test tests/sdk/config.test.ts
```

## See Also

- [README.md](../README.md) - Quick start guide
- [COMMANDS.md](COMMANDS.md) - Command reference
- [SDK-INTEGRATION.md](SDK-INTEGRATION.md) - SDK architecture
- [SECURITY.md](SECURITY.md) - Security best practices

---

Last Updated: October 2024 (Environment-Based Configuration)
