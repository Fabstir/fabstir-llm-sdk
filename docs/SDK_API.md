# Fabstir SDK API Reference

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
- [Migration Guide](#migration-guide)
- [Core SDK](#core-sdk)
- [Authentication](#authentication)
- [Session Management](#session-management)
- [Payment Management](#payment-management)
- [Model Governance](#model-governance)
- [Host Management](#host-management)
- [Storage Management](#storage-management)
- [Treasury Management](#treasury-management)
- [Client Manager](#client-manager)
- [WebSocket Communication](#websocket-communication)
- [Contract Integration](#contract-integration)
- [Services](#services)
- [Error Handling](#error-handling)
- [Types and Interfaces](#types-and-interfaces)
- [Usage Examples](#usage-examples)

## Overview

The Fabstir SDK provides a comprehensive interface for interacting with the Fabstir P2P LLM marketplace. The SDK has been refactored into browser-compatible (`@fabstir/sdk-core`) and Node.js-specific (`@fabstir/sdk-node`) packages.

### Key Features
- Browser-compatible core functionality
- USDC and ETH payment support
- Session-based LLM interactions with context preservation
- Model governance and validation
- WebSocket real-time streaming
- S5 decentralized storage integration
- Base Account Kit for gasless transactions
- Multi-chain support (Base Sepolia, opBNB testnet)
- Chain-aware wallet providers (EOA and Smart Accounts)

## Multi-Chain Support

The SDK now provides comprehensive multi-chain support, allowing seamless operation across different blockchain networks.

### Supported Chains

| Chain | Chain ID | Native Token | Status | Min Deposit |
|-------|----------|--------------|--------|-------------|
| Base Sepolia | 84532 | ETH | Production | 0.0002 ETH |
| opBNB Testnet | 5611 | BNB | Development | 0.001 BNB |

### Chain Configuration

Each chain has its own configuration including contract addresses, RPC endpoints, and network-specific parameters:

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
  minDeposit: string;
  blockExplorer: string;
}
```

### Default Chain Behavior

- The SDK defaults to Base Sepolia (chainId: 84532) when no chain is specified
- All operations are chain-aware and validate the target chain
- Smart contract addresses are automatically selected based on the active chain

## Installation

### Browser/React Applications

```bash
npm install @fabstir/sdk-core
```

### Node.js Applications

```bash
npm install @fabstir/sdk-core @fabstir/sdk-node
```

### Development Setup (npm link)

```bash
# In sdk-core directory
cd packages/sdk-core
pnpm build
npm link

# In your application
npm link @fabstir/sdk-core
```

## Migration Guide

### From `@fabstir/llm-sdk` to `@fabstir/sdk-core`

**Old Import:**
```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
```

**New Import:**
```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
```

### Key Changes
1. P2P functionality moved to `@fabstir/sdk-node`
2. Browser-first design with polyfills for Node.js
3. Enhanced model governance system
4. Improved session management with streaming
5. USDC payment flows with Base Account Kit

### ⚠️ Breaking Changes (Latest - Phase 8 Complete)

#### 1. No Environment Variable Fallbacks
**SDK now requires ALL contract addresses to be provided explicitly:**
- No automatic fallback to process.env variables
- All 5 required contracts MUST be provided in configuration
- Clear error messages for missing/invalid configuration

#### 2. SessionConfig Interface
The `SessionConfig` interface uses string for amounts and numbers for other fields:

**Current Format:**
```typescript
interface SessionConfig {
  depositAmount: string;  // e.g., "1.0" for $1 USDC minimum
  pricePerToken: number;  // e.g., 200 (0.02 cents per token)
  proofInterval: number;  // e.g., 100 (checkpoint every 100 tokens)
  duration: number;       // e.g., 3600 (1 hour timeout)
}
```

#### 3. S5 Seed Generation
- Proper deterministic 15-word seed phrases (13 seed + 2 checksum)
- Generated from wallet signature
- Cached in localStorage for performance
- No more hardcoded test phrases

**Migration Example:**
```typescript
// Old way (will cause errors)
const config = {
  depositAmount: parseUnits("2", 6),  // Returns BigInt
  pricePerToken: BigInt(200),
  proofInterval: BigInt(100),
  duration: BigInt(3600)
};

// New way (correct)
const config = {
  depositAmount: "1.0",  // String with decimal notation
  pricePerToken: 200,    // Regular number
  proofInterval: 100,    // Regular number
  duration: 3600         // Regular number
};
```

## Core SDK

### FabstirSDKCore

The main SDK class for browser environments.

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
```

#### Constructor

```typescript
new FabstirSDKCore(config?: FabstirSDKCoreConfig)
```

**Configuration:**
```typescript
interface FabstirSDKCoreConfig {
  rpcUrl: string;                     // REQUIRED: Blockchain RPC URL
  chainId?: number;                   // Optional: Chain ID (default: 84532 - Base Sepolia)
  contractAddresses: {                // REQUIRED: All 7 contracts
    jobMarketplace: string;           // REQUIRED
    nodeRegistry: string;             // REQUIRED
    proofSystem: string;              // REQUIRED
    hostEarnings: string;             // REQUIRED
    usdcToken: string;                // REQUIRED
    fabToken: string;                 // REQUIRED (was optional, now required)
    modelRegistry: string;            // REQUIRED (was optional, now required)
  };
  s5Config?: {                        // Optional: S5 storage config
    portalUrl?: string;
    seedPhrase?: string;              // Will be auto-generated if not provided
  };
}
```

**⚠️ IMPORTANT:** The SDK will throw clear errors if any required contract addresses are missing.

**Example (REQUIRED Configuration):**
```typescript
const sdk = new FabstirSDKCore({
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    // ALL 7 REQUIRED - SDK will throw error if any missing
    jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
    nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
    proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
    hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
    usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
    fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
    modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
  }
});
```

**Multi-Chain Configuration Examples:**

```typescript
// Base Sepolia Configuration (Default)
const baseSepolia = new FabstirSDKCore({
  rpcUrl: 'https://sepolia.base.org',
  chainId: 84532, // Optional, this is the default
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

// opBNB Testnet Configuration
const opBNBTestnet = new FabstirSDKCore({
  rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
  chainId: 5611, // Required for opBNB
  contractAddresses: {
    // Note: These are placeholder addresses for opBNB testnet
    jobMarketplace: '0x0000000000000000000000000000000000000001',
    nodeRegistry: '0x0000000000000000000000000000000000000002',
    proofSystem: '0x0000000000000000000000000000000000000003',
    hostEarnings: '0x0000000000000000000000000000000000000004',
    usdcToken: '0x0000000000000000000000000000000000000006',
    modelRegistry: '0x0000000000000000000000000000000000000005',
    fabToken: '0x0000000000000000000000000000000000000007'
  }
});
```

**Current Contract Addresses (Base Sepolia):**
```
JobMarketplace: 0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f
NodeRegistry: 0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
ProofSystem: 0x2ACcc60893872A499700908889B38C5420CBcFD1
HostEarnings: 0x908962e8c6CE72610021586f85ebDE09aAc97776
USDCToken: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
FABToken: 0xC78949004B4EB6dEf2D66e49Cd81231472612D62
ModelRegistry: 0x92b2De840bB2171203011A6dBA928d855cA8183E
```

## Authentication

### authenticate

Authenticates the SDK with various providers.

```typescript
async authenticate(
  privateKeyOrSigner: string | ethers.Signer
): Promise<void>
```

**Parameters:**
- `privateKeyOrSigner`: Private key string or ethers.Signer instance

**Example with Private Key:**
```typescript
await sdk.authenticate('0x...');
```

**Example with Base Account Kit (Gasless):**
```typescript
import { createBaseAccountSDK } from "@base-org/account";

// Create Base Account SDK
const baseAccountSDK = createBaseAccountSDK({
  appName: "Your App Name",
  appChainIds: [84532], // Base Sepolia
  subAccounts: {
    unstable_enableAutoSpendPermissions: true // Enable auto-spend
  }
});

// Get provider and connect
const provider = await baseAccountSDK.getProvider();
const accounts = await provider.request({
  method: "eth_requestAccounts",
  params: []
});

const primaryAccount = accounts[0]; // Primary account holds main funds
const subAccount = accounts[1];     // Sub-account for gasless transactions

// Create custom signer for sub-account
const subAccountSigner = {
  provider: new ethers.BrowserProvider(provider),

  async getAddress(): Promise<string> {
    return subAccount;
  },

  async signMessage(message: string): Promise<string> {
    return provider.request({
      method: 'personal_sign',
      params: [message, subAccount]
    });
  },

  async sendTransaction(tx: any): Promise<any> {
    // Base Account Kit handles this with auto-spend from primary
    return provider.request({
      method: 'eth_sendTransaction',
      params: [{ ...tx, from: subAccount }]
    });
  }
};

// Authenticate SDK with sub-account signer
await sdk.authenticate(subAccountSigner);
```

### Base Account Kit Architecture

#### Primary/Sub-Account Model
- **Primary Account**: Holds user's USDC balance (e.g., $7.30)
- **Sub-Account**: Used for gasless transactions with auto-spend permissions
- **Auto-Spend**: Sub-account can pull funds from primary automatically
- **No Popups**: After initial setup, no approval popups for transactions

#### Benefits
- ✅ **Gasless Experience**: No ETH needed for gas fees
- ✅ **No Approval Popups**: Auto-spend permissions eliminate transaction popups
- ✅ **Security**: Funds remain in primary account, minimal in sub-account
- ✅ **Efficiency**: Only transfer what's needed per session ($1 instead of full balance)

#### Current Limitations
- SDK doesn't fully understand Base Account Kit's spend permissions
- Workaround: Transfer $1 per session from primary to sub-account
- Future: Direct spend from primary without transfers

## Chain Management

The SDK provides methods to manage and switch between different blockchain networks.

### initialize

Initialize the SDK with a wallet provider for multi-chain support.

```typescript
async initialize(walletProvider: IWalletProvider): Promise<void>
```

**Parameters:**
- `walletProvider`: Wallet provider implementing IWalletProvider interface

**Example:**
```typescript
import { EOAProvider } from '@fabstir/sdk-core';

const provider = new EOAProvider(window.ethereum);
await sdk.initialize(provider);
```

### getCurrentChainId

Returns the current active chain ID.

```typescript
getCurrentChainId(): number
```

**Returns:** Current chain ID (e.g., 84532 for Base Sepolia)

**Example:**
```typescript
const chainId = sdk.getCurrentChainId();
console.log('Current chain:', chainId); // 84532
```

### getCurrentChain

Returns the full configuration for the current chain.

```typescript
getCurrentChain(): ChainConfig
```

**Returns:** Complete chain configuration object

**Example:**
```typescript
const chain = sdk.getCurrentChain();
console.log('Chain name:', chain.name); // "Base Sepolia"
console.log('Native token:', chain.nativeToken); // "ETH"
console.log('Min deposit:', chain.minDeposit); // "0.0002"
```

### switchChain

Switch to a different supported chain.

```typescript
async switchChain(chainId: number): Promise<void>
```

**Parameters:**
- `chainId`: Target chain ID to switch to

**Throws:**
- `UnsupportedChainError`: If chain is not supported
- Error if wallet provider doesn't support chain switching

**Example:**
```typescript
// Switch from Base Sepolia to opBNB testnet
await sdk.switchChain(5611);

// Managers automatically reinitialize for the new chain
const paymentManager = sdk.getPaymentManager();
// Now operates on opBNB
```

## Wallet Providers

The SDK supports multiple wallet provider types through the IWalletProvider interface.

### IWalletProvider Interface

```typescript
interface IWalletProvider {
  // Connection management
  connect(chainId?: number): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account management
  getAddress(): Promise<string>;
  getDepositAccount(): Promise<string>;

  // Chain management
  getCurrentChainId(): Promise<number>;
  switchChain(chainId: number): Promise<void>;
  getSupportedChains(): number[];

  // Transactions
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
  signMessage(message: string): Promise<string>;

  // Capabilities
  getCapabilities(): WalletCapabilities;
}
```

### EOAProvider (MetaMask/Rainbow)

Standard Ethereum wallet provider for browser extensions.

```typescript
import { EOAProvider } from '@fabstir/sdk-core';

const provider = new EOAProvider(window.ethereum);
await provider.connect(84532); // Connect to Base Sepolia

const capabilities = provider.getCapabilities();
// {
//   supportsGaslessTransactions: false,
//   supportsChainSwitching: true,
//   supportsSmartAccounts: false,
//   requiresDepositAccount: false
// }
```

### SmartAccountProvider

Smart contract wallet provider with gasless transaction support.

```typescript
import { SmartAccountProvider } from '@fabstir/sdk-core';

const provider = new SmartAccountProvider({
  bundlerUrl: 'https://bundler.base.org',
  paymasterUrl: 'https://paymaster.base.org'
});

await provider.connect();

const capabilities = provider.getCapabilities();
// {
//   supportsGaslessTransactions: true,
//   supportsChainSwitching: false,
//   supportsSmartAccounts: true,
//   requiresDepositAccount: true
// }
```

### WalletProviderFactory

Factory for auto-detecting and creating wallet providers.

```typescript
import { WalletProviderFactory } from '@fabstir/sdk-core';

// Auto-detect available provider
const provider = await WalletProviderFactory.createProvider('eoa');

// Or specify type
const eoaProvider = await WalletProviderFactory.createProvider('eoa', window.ethereum);
const smartProvider = await WalletProviderFactory.createProvider('smart-account', config);
```

## Session Management

The SessionManager handles LLM session lifecycle, streaming responses, and context preservation.

### Get SessionManager

```typescript
const sessionManager = sdk.getSessionManager();
```

### startSession

Creates a new LLM session with blockchain job creation.

```typescript
async startSession(
  model: string,
  provider: string,
  config: SessionConfig
): Promise<{
  sessionId: bigint;
  jobId: bigint;
}>
```

**Parameters:**
```typescript
interface SessionConfig {
  depositAmount: string;     // USDC amount as string (e.g., "1.0" for $1)
  pricePerToken: number;     // Price per token (e.g., 200)
  duration: number;          // Session duration in seconds (e.g., 3600)
  proofInterval: number;     // Checkpoint interval in tokens (e.g., 100)
```

**Example:**
```typescript
const { sessionId, jobId } = await sessionManager.startSession(
  '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced', // Model hash
  '0x4594F755F593B517Bb3194F4DeC20C48a3f04504', // Provider address
  {
    depositAmount: "1.0",    // $1 USDC minimum per session
    pricePerToken: 200,      // 0.0002 USDC per token (0.02 cents)
    duration: 3600,          // 1 hour session timeout
    proofInterval: 100       // Checkpoint every 100 tokens
  },
  'http://localhost:8080'   // Optional: Host WebSocket endpoint
);
```

### sendPrompt

Sends a prompt to the LLM and receives response.

```typescript
async sendPrompt(
  sessionId: bigint,
  prompt: string
): Promise<string>
```

**Example:**
```typescript
const response = await sessionManager.sendPrompt(
  sessionId,
  "What is the capital of France?"
);
```

### sendPromptStreaming

Sends a prompt and receives streaming response via WebSocket.

```typescript
async sendPromptStreaming(
  sessionId: bigint,
  prompt: string,
  onToken?: (token: string) => void
): Promise<string>
```

**Example:**
```typescript
const response = await sessionManager.sendPromptStreaming(
  sessionId,
  "Tell me a story",
  (token) => {
    // Handle each token as it arrives
    process.stdout.write(token);
  }
);
console.log('\nFull response:', response);
```

### submitCheckpoint

Submits a checkpoint proof for token usage.

```typescript
async submitCheckpoint(
  sessionId: bigint,
  proof: CheckpointProof
): Promise<string>
```

**Parameters:**
```typescript
interface CheckpointProof {
  checkpointNumber: number;
  tokensUsed: number;
  proofData: string;        // 64-byte proof minimum
  timestamp: number;
}
```

### completeSession

Completes a session and triggers payment distribution.

```typescript
async completeSession(
  sessionId: bigint,
  totalTokens: number,
  finalProof: string
): Promise<string>
```

### getSessionHistory

Retrieves conversation history for a session.

```typescript
async getSessionHistory(
  sessionId: bigint
): Promise<{
  prompts: string[];
  responses: string[];
  timestamps: number[];
  tokenCounts: number[];
}>
```

### resumeSession

Resumes a paused session.

```typescript
async resumeSession(sessionId: bigint): Promise<void>
```

### pauseSession

Pauses an active session.

```typescript
async pauseSession(sessionId: bigint): Promise<void>
```

## Payment Management

Handles ETH and USDC payments for jobs.

### Get PaymentManager

```typescript
const paymentManager = sdk.getPaymentManager();
```

### createSessionJobWithUSDC

Creates a session job with USDC payment.

```typescript
async createSessionJobWithUSDC(
  provider: string,
  amount: string,         // Amount in USDC (e.g., "2" for $2)
  config: {
    pricePerToken: number;
    duration: number;
    proofInterval: number;
  }
): Promise<{
    sessionId: bigint;
    txHash: string;
}>
```

**Example:**
```typescript
const result = await paymentManager.createSessionJobWithUSDC(
  '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
  '2', // $2 USDC
  {
    pricePerToken: 200,
    duration: 3600,
    proofInterval: 100
  }
);
```

### createSessionJobWithETH

Creates a session job with ETH payment.

```typescript
async createSessionJobWithETH(
  provider: string,
  amount: string,         // Amount in ETH (e.g., "0.001")
  config: {
    pricePerToken: number;
    duration: number;
    proofInterval: number;
  }
): Promise<{
    sessionId: bigint;
    txHash: string;
}>
```

### getTokenBalance

Gets token balance for an address.

```typescript
async getTokenBalance(
  tokenAddress: string,
  address: string
): Promise<bigint>
```

**Example:**
```typescript
const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
const balance = await paymentManager.getTokenBalance(usdcAddress, userAddress);
console.log(`USDC Balance: $${ethers.formatUnits(balance, 6)}`);
```

### depositNative

Deposits native tokens (ETH/BNB) for gasless session operations.

```typescript
async depositNative(
  amount: string,
  chainId?: number
): Promise<TransactionResponse>
```

**Parameters:**
- `amount`: Amount to deposit in native token (e.g., "0.001" for 0.001 ETH/BNB)
- `chainId`: Optional chain ID (uses current chain if not specified)

**Example:**
```typescript
// Deposit ETH on Base Sepolia
const tx = await paymentManager.depositNative("0.001");
await tx.wait(3);

// Deposit BNB on opBNB
await sdk.switchChain(5611);
const bnbTx = await paymentManager.depositNative("0.002");
await bnbTx.wait(3);
```

### withdrawNative

Withdraws native tokens from deposited balance.

```typescript
async withdrawNative(
  amount: string,
  chainId?: number
): Promise<TransactionResponse>
```

**Parameters:**
- `amount`: Amount to withdraw in native token
- `chainId`: Optional chain ID (uses current chain if not specified)

**Example:**
```typescript
// Withdraw ETH from Base Sepolia
const tx = await paymentManager.withdrawNative("0.0005");
await tx.wait(3);
```

### getDepositBalance

Gets the deposited balance for the current account.

```typescript
async getDepositBalance(
  chainId?: number
): Promise<{
  native: string;
  usdc: string;
}>
```

**Returns:** Balance object with native and USDC amounts

**Example:**
```typescript
const balances = await paymentManager.getDepositBalance();
console.log('ETH deposited:', balances.native);
console.log('USDC deposited:', balances.usdc);
```

### Chain-Specific Minimum Deposits

Different chains have different minimum deposit requirements:

| Chain | Minimum Deposit | Native Token |
|-------|----------------|--------------|
| Base Sepolia | 0.0002 ETH | ETH |
| opBNB Testnet | 0.001 BNB | BNB |

### sendToken

Sends tokens from one address to another.

```typescript
async sendToken(
  tokenAddress: string,
  toAddress: string,
  amount: string
): Promise<TransactionResult>
```

**Example:**
```typescript
const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
const tx = await paymentManager.sendToken(
  usdcAddress,
  subAccount,
  ethers.parseUnits("1.0", 6).toString()
);
```

### approveToken

Approves a spender to use tokens.

```typescript
async approveToken(
  tokenAddress: string,
  spender: string,
  amount: string
): Promise<TransactionResult>
```

**Example:**
```typescript
const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
const marketplaceAddress = sdk.contractManager.getAddress('jobMarketplace');
const tx = await paymentManager.approveToken(
  usdcAddress,
  marketplaceAddress,
  ethers.parseUnits("10.0", 6).toString()
);
```

### Payment Distribution Model

The SDK implements a transparent payment distribution system:

#### Deposit Model
- **Minimum Deposit**: $1.00 USDC per session (reduced from $2.00)
- **Actual Usage**: Typically $0.02-0.03 per session
- **Refunds**: Unused funds remain in sub-account for future sessions
- **Auto-reuse**: Subsequent sessions use existing balance (no new deposit needed)

#### Distribution Split
When a session ends and checkpoint is submitted:
- **Host (Provider)**: Receives 90% of consumed tokens value
- **Treasury**: Receives 10% as platform fee
- **User**: Gets refund of unused deposit to sub-account

#### Example Payment Flow
```typescript
// User deposits $1.00 for session
// Session uses 150 tokens at 0.0002 USDC per token = $0.03
// Distribution:
// - Host receives: $0.027 (90% of $0.03)
// - Treasury receives: $0.003 (10% of $0.03)
// - User refund: $0.97 (stays in sub-account)
// User can run ~32 more sessions without new deposit
```

#### Checkpoint Submission
```typescript
async submitCheckpoint(
  sessionId: bigint,
  tokensGenerated: number
): Promise<string>
```

**Important Notes:**
- Minimum 100 tokens must be submitted per checkpoint
- 5-second wait required before submission (ProofSystem rate limit)
- Checkpoint triggers automatic payment distribution

## Model Governance

The ModelManager handles model validation and governance.

### Get ModelManager

```typescript
const modelManager = sdk.getModelManager();
```

**Note:** As of the latest SDK update, ModelManager is now directly accessible via the `getModelManager()` getter method on the SDK instance. This requires prior authentication.

### getModelId

Generates deterministic model ID from Hugging Face repo and file.

```typescript
async getModelId(
  huggingfaceRepo: string,
  fileName: string
): Promise<string>
```

**Example:**
```typescript
const modelId = await modelManager.getModelId(
  'meta-llama/Llama-2-7b-hf',
  'model.safetensors'
);
```

### isModelApproved

Checks if a model is approved for use.

```typescript
async isModelApproved(modelId: string): Promise<boolean>
```

### getModelDetails

Gets detailed information about a model.

```typescript
async getModelDetails(modelId: string): Promise<ModelInfo | null>
```

**Returns:**
```typescript
interface ModelInfo {
  id: string;
  huggingfaceRepo: string;
  fileName: string;
  modelHash: string;
  size: bigint;
  approved: boolean;
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}
```

### getAllApprovedModels

Gets all approved models in the registry.

```typescript
async getAllApprovedModels(): Promise<ModelInfo[]>
```

### validateModel

Validates a model specification and optionally verifies file hash.

```typescript
async validateModel(
  modelSpec: ModelSpec,
  fileContent?: ArrayBuffer
): Promise<ModelValidation>
```

**Parameters:**
```typescript
interface ModelSpec {
  huggingfaceRepo: string;
  fileName: string;
  modelHash: string;
}

interface ModelValidation {
  isValid: boolean;
  isApproved: boolean;
  hashMatches?: boolean;
  errors: string[];
}
```

### verifyModelHash

Verifies a model file's hash.

```typescript
async verifyModelHash(
  fileContent: ArrayBuffer,
  expectedHash: string
): Promise<boolean>
```

## Host Management

The HostManagerEnhanced provides advanced host management with model support.

### Get HostManagerEnhanced

```typescript
const hostManager = sdk.getHostManagerEnhanced();
```

### registerHostWithModels

Registers a host with supported models.

```typescript
async registerHostWithModels(
  request: HostRegistrationWithModels
): Promise<string>
```

**Parameters:**
```typescript
interface HostRegistrationWithModels {
  metadata: HostMetadata;
  supportedModels: ModelSpec[];
  stake?: string;           // Optional stake amount
  apiUrl?: string;          // Host API endpoint
}

interface HostMetadata {
  hardware: {
    gpu: string;
    vram: number;
    ram: number;
  };
  capabilities: string[];   // e.g., ['streaming', 'batch']
  location: string;
  maxConcurrent: number;
  costPerToken: number;
}
```

### findHostsForModel

Finds hosts that support a specific model.

```typescript
async findHostsForModel(modelId: string): Promise<HostInfo[]>
```

**Returns:**
```typescript
interface HostInfo {
  address: string;
  metadata: HostMetadata;
  supportedModels: string[];
  isActive: boolean;
  stake: bigint;
  reputation: number;
  apiUrl?: string;
}
```

### updateHostModels

Updates the models supported by the current host.

```typescript
async updateHostModels(newModels: ModelSpec[]): Promise<string>
```

### getHostStatus

Gets comprehensive status of a host.

```typescript
async getHostStatus(hostAddress: string): Promise<{
  isActive: boolean;
  isRegistered: boolean;
  supportedModels: string[];
  metadata: HostMetadata;
  earnings: string;
  reputation: number;
}>
```

### discoverAllActiveHostsWithModels

Discovers all active hosts with their supported models.

```typescript
async discoverAllActiveHostsWithModels(): Promise<HostInfo[]>
```

### hostSupportsModel

Checks if a host supports a specific model.

```typescript
async hostSupportsModel(
  hostAddress: string,
  modelId: string
): Promise<boolean>
```

### updateApiUrl

Updates the host's API endpoint URL.

```typescript
async updateApiUrl(apiUrl: string): Promise<string>
```

### withdrawEarnings

Withdraws accumulated earnings for a host.

```typescript
async withdrawEarnings(tokenAddress: string): Promise<string>
```

## Storage Management

Handles S5 decentralized storage operations with deterministic seed generation.

### Get StorageManager

```typescript
const storageManager = await sdk.getStorageManager();
```

**Note:** S5 seed phrases are now automatically generated deterministically from your wallet signature. The SDK:
- Generates a unique 15-word seed phrase per wallet
- Caches the seed in localStorage for performance
- No longer requires manual seed phrase configuration

### storeConversation

Stores a conversation in S5.

```typescript
async storeConversation(
  sessionId: string,
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>
): Promise<string>
```

### retrieveConversation

Retrieves a stored conversation.

```typescript
async retrieveConversation(sessionId: string): Promise<{
  messages: Array<{
    role: string;
    content: string;
    timestamp: number;
  }>;
  metadata?: any;
}>
```

### storeSessionMetadata

Stores session metadata.

```typescript
async storeSessionMetadata(
  sessionId: string,
  metadata: {
    model: string;
    provider: string;
    startTime: number;
    config: SessionConfig;
  }
): Promise<string>
```

## Treasury Management

Manages treasury operations and fee distribution.

### Get TreasuryManager

```typescript
const treasuryManager = sdk.getTreasuryManager();
```

### getTreasuryInfo

Gets treasury information.

```typescript
async getTreasuryInfo(): Promise<TreasuryInfo>
```

**Returns:**
```typescript
interface TreasuryInfo {
  address: string;
  balance: string;
  feePercentage: number;
  totalCollected: string;
}
```

### getTreasuryBalance

Gets treasury balance for a specific token.

```typescript
async getTreasuryBalance(tokenAddress: string): Promise<string>
```

### withdrawTreasuryFunds

Withdraws funds from treasury (admin only).

```typescript
async withdrawTreasuryFunds(
  tokenAddress: string,
  amount: string
): Promise<string>
```

## Client Manager

The ClientManager provides client-side operations for model selection, host discovery, and job management.

### Get ClientManager

```typescript
const clientManager = sdk.getClientManager();
```

**Note:** ClientManager requires authentication before use. Added in latest SDK update.

### selectHostForModel

Selects the best host for a specific model based on requirements.

```typescript
async selectHostForModel(
  modelId: string,
  requirements?: {
    maxCostPerToken?: number;
    minReputation?: number;
    requiredCapabilities?: string[];
    preferredLocation?: string;
  }
): Promise<HostInfo | null>
```

**Example:**
```typescript
const host = await clientManager.selectHostForModel(
  '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
  {
    maxCostPerToken: 300,
    minReputation: 80,
    requiredCapabilities: ['streaming']
  }
);
```

### getModelAvailability

Gets availability information for a specific model across the network.

```typescript
async getModelAvailability(modelId: string): Promise<{
  totalHosts: number;
  activeHosts: number;
  averageCostPerToken: number;
  locations: string[];
}>
```

### estimateJobCost

Estimates the cost for a job based on expected token usage.

```typescript
async estimateJobCost(
  modelId: string,
  expectedTokens: number,
  hostAddress?: string
): Promise<{
  estimatedCost: string;
  pricePerToken: number;
  hostAddress: string;
}>
```

**Example:**
```typescript
const estimate = await clientManager.estimateJobCost(
  modelId,
  1000, // Expected 1000 tokens
  hostAddress
);
console.log(`Estimated cost: $${estimate.estimatedCost}`);
```

### createInferenceJob

Creates an inference job with automatic model and host validation.

```typescript
async createInferenceJob(
  modelSpec: {
    repo: string;
    fileName: string;
  },
  hostAddress: string,
  config: SessionConfig
): Promise<{
  sessionId: bigint;
  jobId: bigint;
  txHash: string;
}>
```

### getHostsByModel

Gets all hosts that support a specific model.

```typescript
async getHostsByModel(modelId: string): Promise<HostInfo[]>
```

**Example:**
```typescript
const hosts = await clientManager.getHostsByModel(modelId);
console.log(`Found ${hosts.length} hosts supporting this model`);

// Sort by cost
const sortedHosts = hosts.sort((a, b) =>
  a.metadata.costPerToken - b.metadata.costPerToken
);
```

## WebSocket Communication

Real-time communication for streaming responses.

### WebSocketClient

```typescript
import { WebSocketClient } from '@fabstir/sdk-core';
```

### Constructor

```typescript
new WebSocketClient(url: string, options?: WebSocketOptions)
```

**Options:**
```typescript
interface WebSocketOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}
```

### connect

Establishes WebSocket connection.

```typescript
async connect(): Promise<void>
```

### sendMessage

Sends a message through WebSocket and waits for response.

```typescript
async sendMessage(message: WebSocketMessage): Promise<string>
```

### onMessage

Registers a message handler and returns unsubscribe function.

```typescript
onMessage(handler: (data: any) => void): () => void
```

### disconnect

Closes the WebSocket connection gracefully.

```typescript
async disconnect(): Promise<void>
```

### isConnected

Check if WebSocket is connected.

```typescript
isConnected(): boolean
```

### getReadyState

Get WebSocket connection state.

```typescript
getReadyState(): number
```

**Example:**
```typescript
const ws = new WebSocketClient('ws://localhost:8080');
await ws.connect();

// Register message handler (returns unsubscribe function)
const unsubscribe = ws.onMessage((data) => {
  console.log('Received:', data);
});

// Send message and wait for response
const response = await ws.sendMessage({
  type: 'inference',
  sessionId: '123',
  prompt: 'Hello'
});

// Check connection status
if (ws.isConnected()) {
  console.log('WebSocket is connected');
}

// Clean up
unsubscribe();
await ws.disconnect();
```

## Contract Integration

### SessionJobManager

Direct contract interaction for session jobs.

```typescript
const sessionJobManager = sdk.getSessionJobManager();
```

#### createSessionJob

Creates a session job directly on the blockchain.

```typescript
async createSessionJob(params: SessionJobParams): Promise<SessionResult>
```

**Parameters:**
```typescript
interface SessionJobParams {
  provider: string;
  signer: ethers.Signer;
  tokenAddress: string;     // USDC address
  depositAmount: string;     // Amount in smallest units
  sessionConfig: {
    pricePerToken: bigint;
    duration: bigint;
    proofInterval: bigint;
  };
}

interface SessionResult {
  sessionId: bigint;
  txHash: string;
  receipt: TransactionReceipt;
}
```

#### submitCheckpointProof

Submits checkpoint proof as provider.

```typescript
async submitCheckpointProof(
  sessionId: bigint,
  checkpointNumber: number,
  tokensUsed: number,
  proofData: string
): Promise<string>
```

#### completeSessionJob

Completes a session job.

```typescript
async completeSessionJob(
  sessionId: bigint,
  conversationCID: string
): Promise<string>
```

## Services

### ProofVerifier

Verifies cryptographic proofs.

```typescript
const proofVerifier = new ProofVerifier();
```

#### verifyCheckpointProof

Verifies a checkpoint proof.

```typescript
async verifyCheckpointProof(
  proof: string,
  expectedData: {
    sessionId: bigint;
    checkpointNumber: number;
    tokensUsed: number;
  }
): Promise<boolean>
```

#### generateProof

Generates a proof for checkpoint.

```typescript
async generateProof(
  data: {
    sessionId: bigint;
    checkpointNumber: number;
    tokensUsed: number;
    timestamp: number;
  }
): Promise<string>
```

### EnvironmentDetector

Detects runtime environment capabilities.

```typescript
import { EnvironmentDetector } from '@fabstir/sdk-core';

const detector = new EnvironmentDetector();
const capabilities = detector.getCapabilities();

if (capabilities.hasP2P) {
  // P2P features available
}
if (capabilities.hasWebSockets) {
  // WebSocket features available
}
```

## Error Handling

The SDK uses typed errors with specific codes.

### Error Codes

```typescript
enum SDKErrorCode {
  // Authentication
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  INVALID_SIGNER = 'INVALID_SIGNER',

  // Managers
  MANAGER_NOT_INITIALIZED = 'MANAGER_NOT_INITIALIZED',
  MANAGER_NOT_AUTHENTICATED = 'MANAGER_NOT_AUTHENTICATED',

  // Transactions
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  APPROVAL_FAILED = 'APPROVAL_FAILED',

  // Sessions
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_SESSION_STATE = 'INVALID_SESSION_STATE',

  // Models
  MODEL_NOT_APPROVED = 'MODEL_NOT_APPROVED',
  MODEL_VALIDATION_FAILED = 'MODEL_VALIDATION_FAILED',
  INVALID_MODEL_HASH = 'INVALID_MODEL_HASH',

  // Storage
  STORAGE_ERROR = 'STORAGE_ERROR',
  S5_CONNECTION_FAILED = 'S5_CONNECTION_FAILED',

  // WebSocket
  WEBSOCKET_CONNECTION_FAILED = 'WEBSOCKET_CONNECTION_FAILED',
  WEBSOCKET_MESSAGE_FAILED = 'WEBSOCKET_MESSAGE_FAILED',

  // Proofs
  INVALID_PROOF = 'INVALID_PROOF',
  PROOF_VERIFICATION_FAILED = 'PROOF_VERIFICATION_FAILED',

  // Client Manager
  CLIENT_MANAGER_ERROR = 'CLIENT_MANAGER_ERROR',
  HOST_NOT_FOUND = 'HOST_NOT_FOUND',
  HOST_SELECTION_FAILED = 'HOST_SELECTION_FAILED',

  // Configuration
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  MISSING_CONTRACT_ADDRESS = 'MISSING_CONTRACT_ADDRESS',

  // Multi-chain
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
  CHAIN_MISMATCH = 'CHAIN_MISMATCH',
  INSUFFICIENT_DEPOSIT = 'INSUFFICIENT_DEPOSIT',
  NODE_CHAIN_MISMATCH = 'NODE_CHAIN_MISMATCH',
  DEPOSIT_ACCOUNT_UNAVAILABLE = 'DEPOSIT_ACCOUNT_UNAVAILABLE'
}
```

### Multi-Chain Error Types

```typescript
class UnsupportedChainError extends Error {
  constructor(chainId: number, supportedChains: number[]);
}

class ChainMismatchError extends Error {
  constructor(expected: number, actual: number, operation: string);
}

class InsufficientDepositError extends Error {
  constructor(required: string, available: string, chainId: number);
}

class NodeChainMismatchError extends Error {
  constructor(nodeChainId: number, sdkChainId: number);
}
```

### Error Handling Example

```typescript
try {
  await sdk.authenticate(privateKey);
  const sessionManager = sdk.getSessionManager();

  const { sessionId } = await sessionManager.startSession(
    modelId,
    provider,
    config
  );
} catch (error) {
  switch (error.code) {
    case SDKErrorCode.AUTH_FAILED:
      console.error('Authentication failed:', error.message);
      break;
    case SDKErrorCode.INSUFFICIENT_BALANCE:
      console.error('Insufficient USDC balance');
      break;
    case SDKErrorCode.MODEL_NOT_APPROVED:
      console.error('Model not approved for use');
      break;
    default:
      console.error('Unexpected error:', error);
  }
}
```

## Types and Interfaces

### Core Types

```typescript
// SDK Configuration
interface FabstirSDKCoreConfig {
  rpcUrl?: string;
  chainId?: number;
  contractAddresses?: ContractAddresses;
  s5Config?: S5Config;
}

// Session Management
interface SessionConfig {
  depositAmount: string;  // USDC amount as decimal string
  pricePerToken: number;  // Price per token in smallest units
  duration: number;       // Session duration in seconds
  proofInterval: number;  // Checkpoint interval in tokens
}

interface SessionJob {
  id: bigint;
  jobId: bigint;
  client: string;
  provider: string;
  model: string;
  depositAmount: bigint;
  pricePerToken: bigint;
  tokensUsed: bigint;
  status: 'active' | 'completed' | 'failed';
  startTime: bigint;
  endTime?: bigint;
  checkpoints: CheckpointProof[];
}

interface CheckpointProof {
  checkpointNumber: number;
  tokensUsed: number;
  proofData: string;
  timestamp: number;
}

// Model Governance
interface ModelInfo {
  id: string;
  huggingfaceRepo: string;
  fileName: string;
  modelHash: string;
  size: bigint;
  approved: boolean;
  metadata?: ModelMetadata;
}

interface ModelSpec {
  huggingfaceRepo: string;
  fileName: string;
  modelHash: string;
}

interface ModelValidation {
  isValid: boolean;
  isApproved: boolean;
  hashMatches?: boolean;
  errors: string[];
}

// Host Management
interface HostInfo {
  address: string;
  metadata: HostMetadata;
  supportedModels: string[];
  isActive: boolean;
  stake: bigint;
  reputation: number;
  apiUrl?: string;
}

interface HostMetadata {
  hardware: {
    gpu: string;
    vram: number;
    ram: number;
  };
  capabilities: string[];
  location: string;
  maxConcurrent: number;
  costPerToken: number;
}

// Chat/Conversation Types
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

interface ConversationData {
  sessionId: string;
  messages: ChatMessage[];
  metadata: {
    model: string;
    provider: string;
    totalTokens: number;
    totalCost: number;
  };
}
```

## Usage Examples

### Complete USDC Payment Flow with Context Preservation

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { createBaseAccountSDK } from "@base-org/account";
import { ethers } from 'ethers';

async function chatWithContext() {
  // 1. Initialize SDK with ALL required contracts
  const sdk = new FabstirSDKCore({
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
    contractAddresses: {
      // ALL 5 REQUIRED
      jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
      nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
      usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
    }
  });

  // 2. Setup Base Account Kit for gasless transactions
  const baseAccountSDK = await createBaseAccountSDK({
    chainId: 84532,
    jsonRpcUrl: process.env.RPC_URL,
    bundlerUrl: process.env.BUNDLER_URL,
    paymasterUrl: process.env.PAYMASTER_URL
  });

  // 3. Create sub-account for auto-spend
  const subAccount = await baseAccountSDK.createSubAccount({
    spender: {
      address: sdk.getContractAddress('jobMarketplace'),
      token: sdk.getContractAddress('usdcToken'),
      allowance: parseUnits('10', 6) // $10 USDC allowance
    }
  });

  // 4. Authenticate with sub-account
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(subAccount.privateKey, provider);
  await sdk.authenticate(signer);

  // 5. Get managers
  const sessionManager = sdk.getSessionManager();
  const storageManager = await sdk.getStorageManager();

  // 6. Start session with USDC payment
  const { sessionId } = await sessionManager.startSession(
    '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
    '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
    {
      depositAmount: "1.0",        // $1 USDC minimum deposit
      pricePerToken: 200,          // 0.0002 USDC per token
      duration: 3600,              // 1 hour timeout
      proofInterval: 100           // Checkpoint every 100 tokens
    }
  );

  console.log('Session started:', sessionId.toString());

  // 7. Conversation with context preservation
  const conversation: ChatMessage[] = [];

  // First prompt
  let prompt = "What is the capital of France?";
  let response = await sessionManager.sendPrompt(sessionId, prompt);

  conversation.push(
    { role: 'user', content: prompt, timestamp: Date.now() },
    { role: 'assistant', content: response, timestamp: Date.now(), tokens: 15 }
  );

  // Second prompt with context
  const context = conversation.map(msg =>
    `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
  ).join('\n');

  prompt = "Tell me more about that city";
  const fullPrompt = `${context}\nUser: ${prompt}\nAssistant:`;
  response = await sessionManager.sendPrompt(sessionId, fullPrompt);

  conversation.push(
    { role: 'user', content: prompt, timestamp: Date.now() },
    { role: 'assistant', content: response, timestamp: Date.now(), tokens: 95 }
  );

  // 8. Store conversation in S5
  const cid = await storageManager.storeConversation(
    sessionId.toString(),
    conversation
  );
  console.log('Conversation stored:', cid);

  // 9. Submit checkpoint proof
  const totalTokens = conversation.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
  const checkpointProof = {
    checkpointNumber: 1,
    tokensUsed: totalTokens,
    proofData: '0x' + '00'.repeat(64), // 64-byte proof
    timestamp: Date.now()
  };

  await sessionManager.submitCheckpoint(sessionId, checkpointProof);

  // 10. Complete session
  const finalProof = '0x' + 'ff'.repeat(64);
  const txHash = await sessionManager.completeSession(
    sessionId,
    totalTokens,
    finalProof
  );

  console.log('Session completed:', txHash);
}
```

### Using ClientManager for Model and Host Selection

```typescript
async function selectOptimalHostForJob() {
  const sdk = new FabstirSDKCore(config);
  await sdk.authenticate(privateKey);

  const clientManager = sdk.getClientManager();
  const modelManager = sdk.getModelManager();

  // Find best host for a specific model
  const modelId = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

  // Select host based on requirements
  const host = await clientManager.selectHostForModel(modelId, {
    maxCostPerToken: 250,
    requiredCapabilities: ['streaming'],
    minReputation: 75
  });

  if (!host) {
    throw new Error('No suitable host found for model');
  }

  // Estimate job cost
  const estimate = await clientManager.estimateJobCost(
    modelId,
    500, // Expected 500 tokens
    host.address
  );

  console.log(`Selected host: ${host.address}`);
  console.log(`Estimated cost: $${estimate.estimatedCost}`);
  console.log(`Price per token: ${estimate.pricePerToken}`);

  // Create inference job
  const result = await clientManager.createInferenceJob(
    { repo: 'CohereForAI/TinyVicuna-1B-32k-GGUF', fileName: 'tiny-vicuna-1b.q4_k_m.gguf' },
    host.address,
    {
      depositAmount: "1.0",
      pricePerToken: estimate.pricePerToken,
      duration: 3600,
      proofInterval: 100
    }
  );

  return result;
}
```

### Model Discovery and Validation

```typescript
async function discoverAndValidateModels() {
  const sdk = new FabstirSDKCore(config);
  await sdk.authenticate(privateKey);

  const modelManager = sdk.getModelManager();
  const hostManager = sdk.getHostManagerEnhanced();

  // 1. Get all approved models
  const approvedModels = await modelManager.getAllApprovedModels();
  console.log(`Found ${approvedModels.length} approved models`);

  // 2. Find a specific model
  const modelId = await modelManager.getModelId(
    'meta-llama/Llama-2-7b-hf',
    'model.safetensors'
  );

  // 3. Check if model is approved
  const isApproved = await modelManager.isModelApproved(modelId);
  if (!isApproved) {
    throw new Error('Model not approved for use');
  }

  // 4. Get model details
  const modelInfo = await modelManager.getModelDetails(modelId);
  console.log('Model info:', modelInfo);

  // 5. Find hosts supporting this model
  const hosts = await hostManager.findHostsForModel(modelId);
  console.log(`Found ${hosts.length} hosts supporting this model`);

  // 6. Select best host based on criteria
  const bestHost = hosts.reduce((best, host) => {
    if (!best || host.metadata.costPerToken < best.metadata.costPerToken) {
      return host;
    }
    return best;
  }, hosts[0]);

  console.log('Selected host:', bestHost.address);
  console.log('Cost per token:', bestHost.metadata.costPerToken);
  console.log('Hardware:', bestHost.metadata.hardware);

  return { modelId, hostAddress: bestHost.address };
}
```

### Streaming Responses with WebSocket

```typescript
async function streamingChat() {
  const sdk = new FabstirSDKCore();
  await sdk.authenticate(privateKey);

  const sessionManager = sdk.getSessionManager();

  // Start session
  const { sessionId } = await sessionManager.startSession(
    modelId,
    providerAddress,
    config
  );

  // Send prompt with streaming
  const response = await sessionManager.sendPromptStreaming(
    sessionId,
    "Write a story about a robot",
    (token) => {
      // Handle each token as it arrives
      process.stdout.write(token);
    }
  );

  console.log('\n\nStreaming complete!');
  console.log('Total response length:', response.length);
}
```

### Host Registration with Models

```typescript
async function registerAsHost() {
  const sdk = new FabstirSDKCore();
  await sdk.authenticate(hostPrivateKey);

  const hostManager = sdk.getHostManagerEnhanced();
  const modelManager = sdk.getModelManager();

  // Define supported models
  const supportedModels: ModelSpec[] = [
    {
      huggingfaceRepo: 'meta-llama/Llama-2-7b-hf',
      fileName: 'model.safetensors',
      modelHash: '0x...'
    },
    {
      huggingfaceRepo: 'mistralai/Mistral-7B-v0.1',
      fileName: 'model.safetensors',
      modelHash: '0x...'
    }
  ];

  // Validate models are approved
  for (const model of supportedModels) {
    const validation = await modelManager.validateModel(model);
    if (!validation.isApproved) {
      throw new Error(`Model not approved: ${model.huggingfaceRepo}`);
    }
  }

  // Register host with models
  const txHash = await hostManager.registerHostWithModels({
    metadata: {
      hardware: {
        gpu: 'NVIDIA RTX 4090',
        vram: 24,
        ram: 64
      },
      capabilities: ['streaming', 'batch', 'context-8k'],
      location: 'us-east',
      maxConcurrent: 5,
      costPerToken: 150 // 150 units per token
    },
    supportedModels,
    stake: '100', // 100 FAB tokens
    apiUrl: 'https://my-llm-node.example.com'
  });

  console.log('Host registered:', txHash);

  // Update API URL if needed
  await hostManager.updateApiUrl('https://new-api.example.com');

  // Check earnings
  const status = await hostManager.getHostStatus(hostAddress);
  console.log('Earnings:', status.earnings);

  // Withdraw earnings
  if (parseFloat(status.earnings) > 0) {
    const withdrawTx = await hostManager.withdrawEarnings(USDC_ADDRESS);
    console.log('Earnings withdrawn:', withdrawTx);
  }
}
```

### Error Recovery and Retry Logic

```typescript
async function robustSession() {
  const sdk = new FabstirSDKCore();
  const maxRetries = 3;

  // Authenticate with retry
  for (let i = 0; i < maxRetries; i++) {
    try {
      await sdk.authenticate(privateKey);
      break;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  const sessionManager = sdk.getSessionManager();
  let sessionId: bigint;

  // Start session with proper error handling
  try {
    const result = await sessionManager.startSession(
      modelId,
      providerAddress,
      config
    );
    sessionId = result.sessionId;
  } catch (error) {
    if (error.code === SDKErrorCode.INSUFFICIENT_BALANCE) {
      // Handle insufficient balance
      console.error('Please fund your account with USDC');
      return;
    }
    if (error.code === SDKErrorCode.MODEL_NOT_APPROVED) {
      // Try alternative model
      const alternativeModel = await findAlternativeModel();
      const result = await sessionManager.startSession(
        alternativeModel,
        providerAddress,
        config
      );
      sessionId = result.sessionId;
    } else {
      throw error;
    }
  }

  // Send prompts with retry on WebSocket failures
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await sessionManager.sendPrompt(
        sessionId,
        "Hello, how are you?"
      );
      console.log('Response:', response);
      break;
    } catch (error) {
      if (error.code === SDKErrorCode.WEBSOCKET_CONNECTION_FAILED && i < maxRetries - 1) {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
  }
}
```

## Constants

```typescript
// Network Configuration
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CHAIN_HEX = "0x14a34";

// Payment Configuration
export const MIN_USDC_DEPOSIT = "1";           // $1 minimum (reduced from $2)
export const DEFAULT_PRICE_PER_TOKEN = 200;    // 200 units per token
export const DEFAULT_SESSION_DURATION = 3600;  // 1 hour
export const DEFAULT_PROOF_INTERVAL = 100;     // 100 seconds

// Proof Requirements
export const MIN_PROOF_LENGTH = 64;            // 64 bytes minimum
export const PROOF_VERIFICATION_GAS = 200000;  // Gas for proof verification

// Rate Limiting
export const TOKEN_GENERATION_RATE = 10;       // 10 tokens per second
export const TOKEN_BURST_MULTIPLIER = 2;       // 2x burst allowed

// Payment Distribution (from smart contracts)
export const HOST_PAYMENT_PERCENTAGE = 90;     // 90% to host
export const TREASURY_FEE_PERCENTAGE = 10;     // 10% to treasury

// WebSocket Configuration
export const WS_RECONNECT_INTERVAL = 5000;     // 5 seconds
export const WS_MAX_RECONNECT_ATTEMPTS = 5;
export const WS_HEARTBEAT_INTERVAL = 30000;    // 30 seconds

// S5 Storage Configuration
export const DEFAULT_S5_PORTAL = 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p';
export const S5_UPLOAD_TIMEOUT = 60000;        // 60 seconds
export const S5_DOWNLOAD_TIMEOUT = 30000;      // 30 seconds
```

## Troubleshooting

## Multi-Chain Usage Examples

### Multi-Chain Initialization

```typescript
import { FabstirSDKCore, EOAProvider, WalletProviderFactory } from '@fabstir/sdk-core';
import { ChainId } from '@fabstir/sdk-core/types';

// Initialize SDK with specific chain
const sdk = new FabstirSDKCore({
  rpcUrl: 'https://sepolia.base.org',
  chainId: ChainId.BASE_SEPOLIA, // 84532
  contractAddresses: {
    // Base Sepolia addresses
    jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
    nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
    proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
    hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
    modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
  }
});

// Initialize with wallet provider
const provider = new EOAProvider(window.ethereum);
await sdk.initialize(provider);
await sdk.authenticate('privatekey', { privateKey: process.env.PRIVATE_KEY });
```

### Chain Switching Example

```typescript
// Start on Base Sepolia
console.log('Current chain:', sdk.getCurrentChainId()); // 84532

// Create a session on Base Sepolia
const sessionManager = sdk.getSessionManager();
const baseSession = await sessionManager.startSession(
  modelId,
  hostAddress,
  {
    chainId: ChainId.BASE_SEPOLIA,
    depositAmount: "0.001", // ETH
    pricePerToken: 200,
    duration: 3600,
    proofInterval: 100
  }
);

// Switch to opBNB testnet
await sdk.switchChain(ChainId.OPBNB_TESTNET); // 5611
console.log('Switched to:', sdk.getCurrentChain().name); // "opBNB Testnet"

// Create a session on opBNB
const opbnbSession = await sessionManager.startSession(
  modelId,
  hostAddress,
  {
    chainId: ChainId.OPBNB_TESTNET,
    depositAmount: "0.002", // BNB
    pricePerToken: 200,
    duration: 3600,
    proofInterval: 100
  }
);
```

### Deposit Flow on Multiple Chains

```typescript
// Deposit ETH on Base Sepolia
const paymentManager = sdk.getPaymentManager();

// Check minimum deposit for Base Sepolia
const baseChain = sdk.getCurrentChain();
console.log('Min deposit:', baseChain.minDeposit); // 0.0002 ETH

// Deposit ETH
const ethTx = await paymentManager.depositNative("0.001");
await ethTx.wait(3);

// Check balance
let balance = await paymentManager.getDepositBalance();
console.log('ETH deposited:', balance.native);

// Switch to opBNB and deposit BNB
await sdk.switchChain(ChainId.OPBNB_TESTNET);

const opbnbChain = sdk.getCurrentChain();
console.log('Min deposit:', opbnbChain.minDeposit); // 0.001 BNB

// Deposit BNB
const bnbTx = await paymentManager.depositNative("0.002");
await bnbTx.wait(3);

balance = await paymentManager.getDepositBalance();
console.log('BNB deposited:', balance.native);
```

### Chain-Aware Node Discovery

```typescript
const clientManager = sdk.getClientManager();

// Discover nodes for Base Sepolia
const baseNodes = await clientManager.discoverNodes(ChainId.BASE_SEPOLIA);
console.log('Base Sepolia nodes:', baseNodes.length);

// Check if a node supports specific chain
const nodeChains = await clientManager.getNodeChains('http://node1.base');
if (nodeChains.includes(ChainId.BASE_SEPOLIA)) {
  console.log('Node supports Base Sepolia');
}

// Discover nodes for opBNB
const opbnbNodes = await clientManager.discoverNodes(ChainId.OPBNB_TESTNET);
console.log('opBNB nodes:', opbnbNodes.length);
```

### Error Handling for Multi-Chain

```typescript
import { UnsupportedChainError, ChainMismatchError } from '@fabstir/sdk-core/errors';

try {
  // Try to switch to unsupported chain
  await sdk.switchChain(999999);
} catch (error) {
  if (error instanceof UnsupportedChainError) {
    console.error('Chain not supported:', error.chainId);
    console.log('Supported chains:', error.supportedChains);
  }
}

try {
  // Try to create session on wrong chain
  await sessionManager.startSession(modelId, hostAddress, {
    chainId: ChainId.BASE_SEPOLIA,
    // ... config
  });
} catch (error) {
  if (error instanceof ChainMismatchError) {
    console.error(`Expected chain ${error.expected}, got ${error.actual}`);
  }
}
```

### Cross-Chain Session Management

```typescript
// Track sessions across chains
const sessions = new Map();

// Create session on Base Sepolia
await sdk.switchChain(ChainId.BASE_SEPOLIA);
const baseSessionId = await sessionManager.startSession(modelId, host, {
  chainId: ChainId.BASE_SEPOLIA,
  depositAmount: "0.001",
  pricePerToken: 200,
  duration: 3600,
  proofInterval: 100
});
sessions.set(ChainId.BASE_SEPOLIA, baseSessionId);

// Create session on opBNB
await sdk.switchChain(ChainId.OPBNB_TESTNET);
const opbnbSessionId = await sessionManager.startSession(modelId, host, {
  chainId: ChainId.OPBNB_TESTNET,
  depositAmount: "0.002",
  pricePerToken: 200,
  duration: 3600,
  proofInterval: 100
});
sessions.set(ChainId.OPBNB_TESTNET, opbnbSessionId);

// Resume session on specific chain
await sdk.switchChain(ChainId.BASE_SEPOLIA);
const baseSession = await sessionManager.resumeSession(
  sessions.get(ChainId.BASE_SEPOLIA)
);
```

### Common Issues

#### 1. "chainId must be a hex encoded integer"
**Solution:** Use `CHAIN_HEX = "0x14a34"` instead of decimal chain ID in wallet_sendCalls.

#### 2. "Insufficient USDC balance"
**Solution:**
- Check sub-account balance, not primary account
- Ensure $2 minimum deposit amount
- Fund sub-account from primary account if needed

#### 3. "Invalid proof" error
**Solution:**
- Ensure proof is minimum 64 bytes
- Use proper proof format: `'0x' + '00'.repeat(64)`
- Wait for token accumulation before submitting proof

#### 4. WebSocket connection failures
**Solution:**
- Check if host API URL is accessible
- Verify WebSocket endpoint format (ws:// or wss://)
- Implement retry logic with exponential backoff

#### 5. Model not approved
**Solution:**
- Use `modelManager.getAllApprovedModels()` to find approved models
- Verify model hash matches registry
- Contact governance for model approval

#### 6. Transaction timeout
**Solution:**
- Use `tx.wait(3)` for proper confirmations
- Don't use arbitrary setTimeout delays
- Check network congestion and gas prices

### Browser vs Node.js Differences

| Feature | Browser | Node.js |
|---------|---------|---------|
| P2P Networking | ❌ Not available | ✅ Full libp2p support |
| WebSocket | ✅ Native support | ✅ With ws package |
| S5 Storage | ✅ With IndexedDB | ✅ With polyfill |
| Crypto operations | ✅ Web Crypto API | ✅ Node crypto |
| File system | ❌ Not available | ✅ Full access |

### Debug Mode

Enable debug logging:

```typescript
const sdk = new FabstirSDKCore({
  debug: true,
  logLevel: 'verbose'
});

// Or set environment variable
process.env.FABSTIR_SDK_DEBUG = 'true';
```

## Gas Payment Responsibilities

Understanding who pays gas fees in the Fabstir marketplace:

### Payment Model

| Operation | Who Pays | Estimated Gas | Description |
|-----------|----------|---------------|-------------|
| Session Creation | User | ~200,000 gas | Initial session setup and deposit |
| Checkpoint Proofs | Host | ~30,000 gas each | Every `proofInterval` tokens |
| Session Completion | User | ~100,000 gas | Final settlement and refunds |
| Abandoned Session Claim | Host | ~100,000 gas | After 24 hour timeout |

### Economic Implications

1. **User Incentive Issue**: Users may abandon sessions to avoid paying completion gas
2. **Host Cost Consideration**: Hosts must factor checkpoint gas costs into pricing
3. **Future Solutions**: Exploring gasless completion via account abstraction

### Payment Distribution

Based on treasury configuration (.env.test):
- **Host**: 90% of payment (HOST_EARNINGS_PERCENTAGE)
- **Treasury**: 10% of payment (TREASURY_FEE_PERCENTAGE)
- **User**: Refund of unused deposit

## Support

- GitHub Issues: https://github.com/fabstir/fabstir-llm-sdk/issues
- Documentation: https://docs.fabstir.com
- Discord: https://discord.gg/fabstir

## License

MIT License - See LICENSE file for details.