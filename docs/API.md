# Fabstir LLM SDK API Reference

Complete API documentation for the Fabstir LLM SDK, including all public methods, types, events, and error codes.

## Table of Contents

- [SDK Classes](#sdk-classes)
  - [FabstirSDKHeadless](#fabstirsdkheadless)
  - [FabstirLLMSDK](#fabstirllmsdk)
  - [FabstirSDK (Legacy)](#fabstirsdk-legacy)
- [Payment Methods](#payment-methods)
- [Contract Managers](#contract-managers)
- [Events](#events)
- [Types and Interfaces](#types-and-interfaces)
- [Error Codes](#error-codes)
- [React Adapter](#react-adapter)

## SDK Classes

### FabstirSDKHeadless

The new headless SDK that works in any JavaScript environment without browser dependencies.

#### Constructor

```typescript
new FabstirSDKHeadless(config?: HeadlessConfig)
```

Creates a new instance of the headless SDK.

**Parameters:**
- `config` (optional): Headless SDK configuration object

**Example:**
```typescript
const sdk = new FabstirSDKHeadless({
  mode: "production",
  network: "base-sepolia",
  p2pConfig: {
    bootstrapNodes: ["/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW..."],
  },
  debug: true,
});
```

#### Signer Management Methods

##### setSigner(signer)

Sets or updates the signer for blockchain operations.

```typescript
async setSigner(signer: ethers.Signer): Promise<void>
```

**Parameters:**
- `signer`: An ethers.js Signer instance

**Example:**
```typescript
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
await sdk.setSigner(signer);
```

##### clearSigner()

Removes the current signer.

```typescript
clearSigner(): void
```

##### hasSigner()

Checks if SDK has a signer configured.

```typescript
hasSigner(): boolean
```

##### getSignerAddress()

Gets the current signer address if available.

```typescript
async getSignerAddress(): Promise<string | undefined>
```

### FabstirLLMSDK

Specialized SDK for smart contract interactions with USDC/ETH payment support.

#### Constructor

```typescript
new FabstirLLMSDK(provider: ethers.providers.Provider)
```

#### Payment Methods

##### submitJob(params)

Submits a job with automatic payment method selection.

```typescript
async submitJob(params: JobSubmissionParams): Promise<string>
```

**Parameters:**
```typescript
interface JobSubmissionParams {
  modelId: string;
  prompt: string;
  maxTokens: number;
  offerPrice: string;
  paymentToken?: 'ETH' | 'USDC';  // Defaults to 'ETH'
  paymentAmount?: string;          // For USDC, can differ from offerPrice
  temperature?: number;
  seed?: number;
  resultFormat?: string;
}
```

**Example with ETH:**
```typescript
const jobId = await sdk.submitJob({
  modelId: 'gpt-3.5-turbo',
  prompt: 'Write a poem',
  maxTokens: 100,
  offerPrice: '1000000000000000', // 0.001 ETH in wei
  paymentToken: 'ETH'
});
```

**Example with USDC:**
```typescript
const jobId = await sdk.submitJob({
  modelId: 'gpt-3.5-turbo',
  prompt: 'Write a poem',
  maxTokens: 100,
  offerPrice: '1000000',     // Price in USDC (6 decimals)
  paymentToken: 'USDC',
  paymentAmount: '1000000'   // 1 USDC
});
```

### FabstirSDK (Legacy)

The original SDK that requires calling `connect()` with a provider.

#### connect(provider)

Connects the SDK to a blockchain provider.

```typescript
async connect(provider: ethers.providers.Provider): Promise<void>
```

**Note:** Consider migrating to FabstirSDKHeadless for better flexibility.

## Payment Methods

The SDK now supports multiple payment methods instead of just FAB tokens:

### Supported Payment Tokens

| Token | Symbol | Contract Address | Decimals |
|-------|--------|-----------------|----------|
| Ether | ETH | Native | 18 |
| USD Coin | USDC | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 | 6 |
| Tether | USDT | 0xdAC17F958D2ee523a2206206994597C13D831ec7 | 6 |
| DAI | DAI | 0x6B175474E89094C44Da98b954EedeAC495271d0F | 18 |

### Payment Flow

1. **ETH Payments**: Direct payment with transaction value
2. **USDC Payments**: 
   - SDK checks user's USDC balance
   - Automatically approves spending if needed
   - Calls `postJobWithToken` on the smart contract

### Automatic Approval Handling

When using USDC or other ERC20 tokens, the SDK automatically handles approval:

```typescript
// SDK internally handles:
// 1. Check current allowance
// 2. If insufficient, approve exact amount needed
// 3. Submit job with token payment
```

## Contract Managers

### HeadlessContractManager

The new contract manager that accepts signers in method calls.

```typescript
class HeadlessContractManager {
  async postJob(
    jobDetails: JobDetails,
    requirements: JobRequirements,
    signer: ethers.Signer
  ): Promise<ethers.ContractTransaction>
  
  async postJobWithToken(
    jobDetails: JobDetails,
    requirements: JobRequirements,
    paymentToken: string,
    paymentAmount: string,
    signer: ethers.Signer
  ): Promise<ethers.ContractTransaction>
}
```

## Events

### SDK Events

```typescript
// Connection events
sdk.on('connected', (data: { address: string, chainId: number }) => {});
sdk.on('disconnected', () => {});

// Job events
sdk.on('job:submitted', (data: { jobId: string, request: any }) => {});
sdk.on('job:processing', (data: { jobId: string }) => {});
sdk.on('job:completed', (data: { jobId: string, result: string }) => {});

// Payment events (FabstirLLMSDK)
sdk.on('jobSubmitted', (data: { 
  jobId: string, 
  paymentToken: string,  // 'ETH' or 'USDC'
  txHash: string 
}) => {});

// P2P events
sdk.on('p2p:peer:connect', (peerId: string) => {});
sdk.on('p2p:peer:disconnect', (peerId: string) => {});
sdk.on('p2p:error', (error: Error) => {});
```

## Types and Interfaces

### HeadlessConfig

Configuration for the headless SDK:

```typescript
interface HeadlessConfig {
  network?: "base-sepolia" | "base-mainnet" | "local";
  debug?: boolean;
  mode?: "mock" | "production";
  contractAddresses?: {
    jobMarketplace?: string;
    paymentEscrow?: string;
    nodeRegistry?: string;
  };
  p2pConfig?: P2PConfig;
  nodeDiscovery?: DiscoveryConfig;
  retryOptions?: RetryOptions;
  failoverStrategy?: FailoverStrategy;
}
```

### JobRequest

```typescript
interface JobRequest {
  id: string;
  requester: string;
  modelId: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  estimatedCost: BigNumber;
  timestamp: number;
  paymentToken?: 'ETH' | 'USDC';  // New field
}
```

### JobResponse

```typescript
interface JobResponse {
  requestId: string;
  nodeId: string;
  status: "accepted" | "rejected" | "error";
  estimatedTime?: number;
  actualCost?: BigNumber;
  message?: string;
  paymentToken?: string;  // Token used for payment
}
```

## Error Codes

```typescript
enum ErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  WRONG_NETWORK = 'WRONG_NETWORK',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  INVALID_INPUT = 'INVALID_INPUT',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',  // For USDC
  APPROVAL_FAILED = 'APPROVAL_FAILED'             // For USDC
}
```

## React Adapter

For React applications, use the provided hooks:

### useSDK

```typescript
import { useSDK } from '@fabstir/llm-sdk/adapters/react';

function MyComponent() {
  const sdk = useSDK(config, signer);
  
  if (!sdk) return <div>Connecting...</div>;
  
  // Use SDK methods
}
```

### useSDKWithState

```typescript
import { useSDKWithState } from '@fabstir/llm-sdk/adapters/react';

function MyComponent() {
  const { 
    sdk, 
    isConnected, 
    isLoading, 
    error, 
    submitJob, 
    discoverNodes 
  } = useSDKWithState(config, signer);
  
  const handleSubmit = async () => {
    try {
      const job = await submitJob({
        modelId: 'gpt-3.5-turbo',
        prompt: 'Hello',
        maxTokens: 100,
        paymentToken: 'USDC',  // Use USDC for payment
        paymentAmount: '1000000'
      });
    } catch (error) {
      console.error('Job submission failed:', error);
    }
  };
}
```

## Migration Guide

### From FabstirSDK to FabstirSDKHeadless

**Before:**
```typescript
const sdk = new FabstirSDK(config);
await sdk.connect(provider);
```

**After:**
```typescript
const sdk = new FabstirSDKHeadless(config);
await sdk.setSigner(signer);
```

### From FAB Token to USDC/ETH Payments

**Before (FAB tokens):**
```typescript
// Old SDK used FAB tokens implicitly
await sdk.submitJob({
  modelId: 'model',
  prompt: 'prompt',
  maxTokens: 100,
  price: '1000000000000000'
});
```

**After (ETH/USDC):**
```typescript
// Explicit payment token selection
await sdk.submitJob({
  modelId: 'model',
  prompt: 'prompt',
  maxTokens: 100,
  offerPrice: '1000000',
  paymentToken: 'USDC',  // or 'ETH'
  paymentAmount: '1000000'
});
```

## Contract Addresses

### Base Sepolia (Chain ID: 84532)
- JobMarketplace: `0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6`
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

### Base Mainnet (Chain ID: 8453)
- JobMarketplace: TBD
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`