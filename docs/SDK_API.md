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

### ⚠️ Breaking Changes (Latest)

#### SessionConfig Interface Change
The `SessionConfig` interface has been updated to use more appropriate types:

**Old Format (DEPRECATED):**
```typescript
interface SessionConfig {
  depositAmount: bigint;  // e.g., 2000000n for $2
  pricePerToken: bigint;
  proofInterval: bigint;
  duration: bigint;
}
```

**New Format (CURRENT):**
```typescript
interface SessionConfig {
  depositAmount: string;  // e.g., "1.0" for $1 USDC
  pricePerToken: number;  // e.g., 200
  proofInterval: number;  // e.g., 100
  duration: number;       // e.g., 3600
}
```

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
  rpcUrl?: string;                    // Blockchain RPC URL
  chainId?: number;                   // Chain ID (default: Base Sepolia)
  contractAddresses?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    proofSystem?: string;
    hostEarnings?: string;
    fabToken?: string;
    usdcToken?: string;
    modelRegistry?: string;
  };
  s5Config?: {
    portalUrl?: string;
    seedPhrase?: string;
  };
}
```

**Example:**
```typescript
const sdk = new FabstirSDKCore({
  rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
  contractAddresses: {
    jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
});
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
await sdk.authenticate('signer', { signer: subAccountSigner });
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
    depositAmount: "1.0",    // $1 USDC (minimum per session)
    pricePerToken: 200,      // 0.0002 USDC per token
    duration: 3600,          // 1 hour
    proofInterval: 100       // Checkpoint every 100 tokens
  },
  'http://localhost:8080'   // Optional: Host endpoint
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
  onChunk: (chunk: string) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void>
```

**Example:**
```typescript
await sessionManager.sendPromptStreaming(
  sessionId,
  "Tell me a story",
  (chunk) => console.log(chunk),
  () => console.log("Complete"),
  (error) => console.error(error)
);
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

### getUSDCBalance

Gets USDC balance for an address.

```typescript
async getUSDCBalance(address: string): Promise<string>
```

### fundSubAccount

Funds a sub-account from main account.

```typescript
async fundSubAccount(
  fromAddress: string,
  toAddress: string,
  amount: string
): Promise<string>
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

Handles S5 decentralized storage operations.

### Get StorageManager

```typescript
const storageManager = await sdk.getStorageManager();
```

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

### send

Sends a message through WebSocket.

```typescript
send(message: any): void
```

### onMessage

Registers a message handler.

```typescript
onMessage(handler: (data: any) => void): void
```

### onError

Registers an error handler.

```typescript
onError(handler: (error: Error) => void): void
```

### close

Closes the WebSocket connection.

```typescript
close(): void
```

**Example:**
```typescript
const ws = new WebSocketClient('ws://localhost:8080');
await ws.connect();

ws.onMessage((data) => {
  console.log('Received:', data);
});

ws.send({
  type: 'inference',
  sessionId: '123',
  prompt: 'Hello'
});
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
  PROOF_VERIFICATION_FAILED = 'PROOF_VERIFICATION_FAILED'
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
  // 1. Initialize SDK
  const sdk = new FabstirSDKCore({
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
    contractAddresses: {
      jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
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
      depositAmount: BigInt(2000000), // $2 USDC
      pricePerToken: BigInt(200),
      duration: BigInt(3600),
      proofInterval: BigInt(100)
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

### Model Discovery and Validation

```typescript
async function discoverAndValidateModels() {
  const sdk = new FabstirSDKCore();
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
  let fullResponse = '';

  await sessionManager.sendPromptStreaming(
    sessionId,
    "Write a story about a robot",
    (chunk) => {
      // Handle each chunk as it arrives
      process.stdout.write(chunk);
      fullResponse += chunk;
    },
    () => {
      // Streaming complete
      console.log('\n\nStreaming complete!');
      console.log('Total response length:', fullResponse.length);
    },
    (error) => {
      // Handle errors
      console.error('Streaming error:', error);
    }
  );
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
export const MIN_USDC_DEPOSIT = "2";           // $2 minimum
export const DEFAULT_PRICE_PER_TOKEN = 200;    // 200 units per token
export const DEFAULT_SESSION_DURATION = 3600;  // 1 hour
export const DEFAULT_PROOF_INTERVAL = 100;     // 100 seconds

// Proof Requirements
export const MIN_PROOF_LENGTH = 64;            // 64 bytes minimum
export const PROOF_VERIFICATION_GAS = 200000;  // Gas for proof verification

// Rate Limiting
export const TOKEN_GENERATION_RATE = 10;       // 10 tokens per second
export const TOKEN_BURST_MULTIPLIER = 2;       // 2x burst allowed

// Payment Distribution
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

## Support

- GitHub Issues: https://github.com/fabstir/fabstir-llm-sdk/issues
- Documentation: https://docs.fabstir.com
- Discord: https://discord.gg/fabstir

## License

MIT License - See LICENSE file for details.