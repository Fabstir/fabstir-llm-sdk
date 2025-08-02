# Fabstir LLM SDK API Reference

The Fabstir LLM SDK provides a TypeScript/JavaScript interface for interacting with the Fabstir P2P LLM Marketplace. This document covers all available methods, types, and usage examples.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Classes](#core-classes)
  - [FabstirSDK](#fabstirsdk)
  - [ContractManager](#contractmanager)
- [Connection Methods](#connection-methods)
- [Job Management](#job-management)
- [Payment Methods](#payment-methods)
- [Response Streaming](#response-streaming)
- [Error Handling](#error-handling)
- [Types and Interfaces](#types-and-interfaces)
- [Events](#events)

## Installation

```bash
npm install @fabstir/llm-sdk
```

## Quick Start

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

// Initialize SDK
const sdk = new FabstirSDK({
  network: 'base-sepolia',
  debug: true
});

// Connect to provider
const provider = new ethers.providers.Web3Provider(window.ethereum);
await sdk.connect(provider);

// Submit a job
const jobId = await sdk.submitJob({
  prompt: 'Explain quantum computing',
  modelId: 'llama2-7b',
  maxTokens: 200
});

// Monitor job status
sdk.onJobStatusChange(jobId, (status) => {
  console.log('Job status:', status);
});
```

## Core Classes

### FabstirSDK

The main SDK class that provides all functionality for interacting with the Fabstir network.

#### Constructor

```typescript
new FabstirSDK(config?: FabstirConfig)
```

**Parameters:**
- `config` (optional): Configuration object
  - `network`: Network to connect to ('base-sepolia', 'base-mainnet', 'local')
  - `rpcUrl`: Custom RPC URL
  - `debug`: Enable debug logging
  - `contractAddresses`: Override default contract addresses

**Example:**
```typescript
const sdk = new FabstirSDK({
  network: 'base-sepolia',
  debug: true,
  rpcUrl: 'https://sepolia.base.org'
});
```

### ContractManager

Manages smart contract interactions. This is automatically initialized by the SDK.

## Connection Methods

### connect()

Connect to a wallet provider.

```typescript
async connect(provider: ethers.providers.Provider): Promise<void>
```

**Parameters:**
- `provider`: An ethers.js compatible provider (MetaMask, WalletConnect, etc.)

**Throws:**
- `Error`: If wrong network
- `FabstirError`: If connection fails

**Example:**
```typescript
const provider = new ethers.providers.Web3Provider(window.ethereum);
await sdk.connect(provider);
```

### disconnect()

Disconnect from the current provider.

```typescript
async disconnect(): Promise<void>
```

### getAddress()

Get the connected wallet address.

```typescript
async getAddress(): Promise<string | null>
```

**Returns:** Wallet address or null if not connected

### getChainId()

Get the current chain ID.

```typescript
async getChainId(): Promise<number>
```

### isConnected

Check if SDK is connected.

```typescript
get isConnected(): boolean
```

## Job Management

### submitJob()

Submit a new job to the marketplace.

```typescript
async submitJob(jobRequest: JobRequest): Promise<number>
```

**Parameters:**
- `jobRequest`: Job request object
  - `prompt`: The input prompt (required)
  - `modelId`: Model to use (required)
  - `maxTokens`: Maximum tokens to generate (required)
  - `temperature`: Sampling temperature (optional, default: 0.7)
  - `paymentToken`: Token for payment (optional, default: 'USDC')
  - `maxPrice`: Maximum price willing to pay (optional)

**Returns:** Job ID

**Example:**
```typescript
const jobId = await sdk.submitJob({
  prompt: 'Write a haiku about coding',
  modelId: 'llama2-7b',
  maxTokens: 50,
  temperature: 0.8,
  paymentToken: 'USDC',
  maxPrice: ethers.utils.parseUnits('0.001', 6)
});
```

### estimateJobCost()

Estimate the cost of a job before submission.

```typescript
async estimateJobCost(jobRequest: JobRequest): Promise<CostEstimate>
```

**Returns:**
- `estimatedCost`: Estimated total cost (BigNumber)
- `estimatedTokens`: Estimated token count
- `pricePerToken`: Price per token (BigNumber)
- `modelId`: Model ID
- `includesBuffer`: Whether estimate includes buffer

### getJobDetails()

Get detailed information about a job.

```typescript
async getJobDetails(jobId: number): Promise<JobDetails>
```

**Returns:** Job details object including status, prompt, model, timestamps, etc.

### getJobStatus()

Get the current status of a job.

```typescript
async getJobStatus(jobId: number): Promise<JobStatus>
```

**Returns:** JobStatus enum value (POSTED, CLAIMED, PROCESSING, COMPLETED, FAILED, CANCELLED, DISPUTED)

### onJobStatusChange()

Subscribe to job status changes.

```typescript
onJobStatusChange(jobId: number, callback: (status: JobStatus) => void): () => void
```

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = sdk.onJobStatusChange(jobId, (status) => {
  console.log('New status:', status);
  if (status === JobStatus.COMPLETED) {
    unsubscribe();
  }
});
```

### streamJobEvents()

Stream all events for a job.

```typescript
streamJobEvents(jobId: number, callback: (event: JobEvent) => void): () => void
```

### getJobHost()

Get information about the node processing a job.

```typescript
async getJobHost(jobId: number): Promise<NodeInfo | null>
```

### waitForJobCompletion()

Wait for a job to complete with timeout.

```typescript
async waitForJobCompletion(jobId: number, options?: { timeout?: number }): Promise<boolean>
```

**Returns:** true if completed, false if timed out

### validateJobRequest()

Validate a job request before submission.

```typescript
validateJobRequest(jobRequest: JobRequest): void
```

**Throws:** Error if validation fails

## Payment Methods

### getPaymentDetails()

Get payment details for a job.

```typescript
async getPaymentDetails(jobId: number): Promise<PaymentDetails>
```

**Returns:**
- `jobId`: Job ID
- `amount`: Payment amount (BigNumber)
- `token`: Payment token
- `status`: PaymentStatus
- `payer`: Payer address
- `recipient`: Recipient address
- `escrowedAt`: Escrow timestamp
- `releasedAt`: Release timestamp (optional)

### calculateActualCost()

Calculate actual cost based on tokens used.

```typescript
async calculateActualCost(jobId: number): Promise<ActualCost>
```

**Returns:**
- `totalCost`: Total cost (BigNumber)
- `tokensUsed`: Actual tokens used
- `pricePerToken`: Price per token
- `breakdown`:
  - `hostPayment`: Payment to host (85%)
  - `treasuryFee`: Treasury fee (10%)
  - `stakerReward`: Staker rewards (5%)

### approvePayment()

Approve token payment.

```typescript
async approvePayment(token: string, amount: BigNumber): Promise<TransactionResponse>
```

### approveJobPayment()

Release payment for a completed job.

```typescript
async approveJobPayment(jobId: number): Promise<TransactionResponse>
```

### getPaymentStatus()

Get payment status for a job.

```typescript
async getPaymentStatus(jobId: number): Promise<PaymentStatus>
```

**Returns:** PaymentStatus (PENDING, ESCROWED, RELEASED, REFUNDED, DISPUTED)

### requestRefund()

Request refund for failed/cancelled job.

```typescript
async requestRefund(jobId: number): Promise<TransactionResponse>
```

### getPaymentHistory()

Get payment event history.

```typescript
async getPaymentHistory(jobId: number): Promise<PaymentEvent[]>
```

### onPaymentEvent()

Subscribe to payment events.

```typescript
onPaymentEvent(callback: (event: PaymentEvent) => void): () => void
```

### calculateRefundAmount()

Calculate refund amount for a job.

```typescript
async calculateRefundAmount(jobId: number): Promise<BigNumber>
```

## Response Streaming

### getJobResult()

Get the complete result of a job.

```typescript
async getJobResult(jobId: number): Promise<JobResult>
```

**Returns:**
- `response`: Generated text
- `tokensUsed`: Tokens consumed
- `completionTime`: Completion timestamp

### streamJobResponse()

Stream response tokens as they arrive.

```typescript
async streamJobResponse(jobId: number, callback: (token: string) => void): Promise<void>
```

**Example:**
```typescript
await sdk.streamJobResponse(jobId, (token) => {
  process.stdout.write(token);
});
```

### createResponseStream()

Create an async iterable for response streaming.

```typescript
createResponseStream(jobId: number): AsyncIterableIterator<StreamToken>
```

**Example:**
```typescript
const stream = sdk.createResponseStream(jobId);
for await (const token of stream) {
  console.log(`Token ${token.index}: ${token.content}`);
}
```

### getResultMetadata()

Get metadata about job results.

```typescript
async getResultMetadata(jobId: number): Promise<ResultMetadata>
```

**Returns:**
- `model`: Model used
- `temperature`: Temperature setting
- `inferenceTime`: Time taken for inference (ms)
- `tokensPerSecond`: Performance metric
- `totalTokens`: Total tokens generated

## Error Handling

The SDK uses custom error types for better error handling:

### FabstirError

```typescript
class FabstirError extends Error {
  code: ErrorCode;
  details?: any;
}
```

### ErrorCode Enum

- `CONNECTION_FAILED`: Connection to provider failed
- `WRONG_NETWORK`: Connected to wrong network
- `NOT_CONNECTED`: Method called without connection
- `INSUFFICIENT_BALANCE`: Insufficient token balance
- `JOB_NOT_FOUND`: Job ID not found
- `UNAUTHORIZED`: Unauthorized operation
- `VALIDATION_ERROR`: Input validation failed
- `CONTRACT_ERROR`: Smart contract error
- `NETWORK_ERROR`: Network communication error
- `TIMEOUT`: Operation timed out

**Example:**
```typescript
try {
  await sdk.submitJob(jobRequest);
} catch (error) {
  if (error instanceof FabstirError) {
    switch (error.code) {
      case ErrorCode.INSUFFICIENT_BALANCE:
        console.error('Not enough tokens');
        break;
      case ErrorCode.VALIDATION_ERROR:
        console.error('Invalid job request');
        break;
    }
  }
}
```

## Types and Interfaces

### JobRequest
```typescript
interface JobRequest {
  prompt: string;
  modelId: string;
  maxTokens: number;
  temperature?: number;
  paymentToken?: string;
  maxPrice?: BigNumber;
  metadata?: Record<string, any>;
}
```

### JobStatus
```typescript
enum JobStatus {
  POSTED = "POSTED",
  CLAIMED = "CLAIMED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  DISPUTED = "DISPUTED"
}
```

### PaymentStatus
```typescript
enum PaymentStatus {
  PENDING = "PENDING",
  ESCROWED = "ESCROWED",
  RELEASED = "RELEASED",
  REFUNDED = "REFUNDED",
  DISPUTED = "DISPUTED"
}
```

### NodeInfo
```typescript
interface NodeInfo {
  address: string;
  peerId?: string;
  models: string[];
  reputation: number;
  completedJobs: number;
  failedJobs: number;
  online: boolean;
  latency?: number;
  price?: BigNumber;
  stake: BigNumber;
  endpoint?: string;
}
```

### StreamToken
```typescript
interface StreamToken {
  content: string;
  timestamp: number;
  index: number;
  metadata?: {
    modelId: string;
    temperature: number;
    jobId: number;
  };
}
```

## Events

The SDK extends EventEmitter and emits the following events:

### SDK Events

- `connected`: Emitted when connected to provider
  ```typescript
  sdk.on('connected', ({ network, address }) => {
    console.log(`Connected to ${network.name} as ${address}`);
  });
  ```

- `disconnected`: Emitted when disconnected
  ```typescript
  sdk.on('disconnected', () => {
    console.log('Disconnected from provider');
  });
  ```

### Job Events

Jobs have their own event emitters accessible via:
- `onJobStatusChange()`: Status change events
- `streamJobEvents()`: All job events
- `streamJobResponse()`: Token streaming events

### Payment Events

- `onPaymentEvent()`: Payment-related events

## Testing Helper Methods

The SDK includes helper methods for testing (prefixed with `_`):

- `_simulateStatusChange(jobId, status)`: Simulate job status change
- `_simulateJobEvent(jobId, event)`: Simulate job event
- `_simulateJobResult(jobId, result)`: Set job result
- `_simulateStreamToken(jobId, token)`: Emit streaming token

**Note:** These methods are for testing only and not available in production.

## Complete Example

```typescript
import { FabstirSDK, JobStatus } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

async function main() {
  // Initialize SDK
  const sdk = new FabstirSDK({
    network: 'base-sepolia',
    debug: true
  });

  // Connect to MetaMask
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await sdk.connect(provider);

  // Estimate cost
  const estimate = await sdk.estimateJobCost({
    prompt: 'Write a poem about blockchain',
    modelId: 'llama2-7b',
    maxTokens: 100
  });
  console.log('Estimated cost:', ethers.utils.formatUnits(estimate.estimatedCost, 6), 'USDC');

  // Submit job
  const jobId = await sdk.submitJob({
    prompt: 'Write a poem about blockchain',
    modelId: 'llama2-7b',
    maxTokens: 100,
    temperature: 0.8
  });
  console.log('Job submitted:', jobId);

  // Monitor status
  const unsubscribe = sdk.onJobStatusChange(jobId, async (status) => {
    console.log('Status:', status);
    
    if (status === JobStatus.COMPLETED) {
      // Get result
      const result = await sdk.getJobResult(jobId);
      console.log('Result:', result.response);
      
      // Get actual cost
      const actualCost = await sdk.calculateActualCost(jobId);
      console.log('Actual cost:', ethers.utils.formatUnits(actualCost.totalCost, 6), 'USDC');
      
      // Release payment
      const tx = await sdk.approveJobPayment(jobId);
      await tx.wait();
      console.log('Payment released');
      
      unsubscribe();
    }
  });

  // Stream response
  await sdk.streamJobResponse(jobId, (token) => {
    process.stdout.write(token);
  });
}

main().catch(console.error);
```

## Network Support

The SDK supports the following networks:

- **Base Sepolia** (testnet): Chain ID 84532
- **Base Mainnet**: Chain ID 8453
- **Local** (Hardhat/Anvil): Chain ID 31337

## License

See LICENSE file in the repository.