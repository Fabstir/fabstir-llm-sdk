# Fabstir LLM SDK API Reference

Complete API documentation for the Fabstir LLM SDK, including all public methods, types, events, and error codes.

## Table of Contents

- [SDK Classes](#sdk-classes)
  - [FabstirSessionSDK](#fabstirsessionsdk)
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

### FabstirSessionSDK

Session-based SDK for conversational AI interactions with built-in S5 storage and WebSocket support.

#### Constructor

```typescript
new FabstirSessionSDK(config: SDKConfig, signer: ethers.Signer)
```

Creates a new session-based SDK instance.

**Parameters:**
- `config`: SDK configuration object with S5 and discovery settings
- `signer`: An ethers.js Signer for blockchain operations

**Example:**
```typescript
const config: SDKConfig = {
  contractAddress: '0x445882e14b22E921c7d4Fe32a7736a32197578AF',
  discoveryUrl: 'https://discovery.fabstir.com',
  s5SeedPhrase: 'your twelve word seed phrase here for s5 storage',
  s5PortalUrl: 'https://s5.fabstir.com',
  enableS5: true,
  cacheConfig: {
    maxEntries: 100,
    ttl: 3600000 // 1 hour
  }
};

const sdk = new FabstirSessionSDK(config, signer);
```

#### Session Management Methods

##### startSession(host, deposit)

Starts a new AI conversation session with a host.

```typescript
async startSession(host: Host, deposit: number): Promise<Session>
```

**Parameters:**
- `host`: Host information object
- `deposit`: Deposit amount in ETH

**Returns:** Session object with job details

##### sendPrompt(content)

Sends a prompt message in the active session.

```typescript
async sendPrompt(content: string): Promise<void>
```

##### endSession()

Ends the current session and settles payment.

```typescript
async endSession(): Promise<PaymentReceipt>
```

**Returns:** Payment receipt with transaction details

##### onResponse(handler)

Registers a handler for incoming response messages.

```typescript
onResponse(handler: (msg: Message) => void): void
```

#### Host Discovery

##### findHosts(criteria)

Discovers available hosts matching criteria.

```typescript
async findHosts(criteria: any): Promise<Host[]>
```

**Parameters:**
- `criteria`: Object with `model` and `maxPrice` fields

#### Storage Methods

##### saveConversation()

Saves the current conversation to S5 storage.

```typescript
async saveConversation(): Promise<void>
```

##### loadPreviousSession(sessionId)

Loads a previous session from cache or S5 storage.

```typescript
async loadPreviousSession(sessionId: number): Promise<{ sessionId: number; messages: Message[] }>
```

#### Session Queries

##### getActiveSessions()

Returns all active sessions.

```typescript
getActiveSessions(): Session[]
```

##### getActiveSession(id)

Gets a specific active session by ID.

```typescript
getActiveSession(id: number): Session | undefined
```

#### Lifecycle Methods

##### isInitialized()

Checks if SDK is initialized.

```typescript
isInitialized(): boolean
```

##### cleanup()

Cleans up resources and disconnects S5 storage.

```typescript
async cleanup(): Promise<void>
```

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

| Token | Symbol | Base Sepolia Contract Address | Decimals |
|-------|--------|-------------------------------|----------|
| Ether | ETH | Native | 18 |
| USD Coin | USDC | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | 6 |

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

// Session events (FabstirSessionSDK)
sdk.on('session:created', (session: Session) => {});
sdk.on('session:connected', (session: Session) => {});
sdk.on('prompt:sent', (message: Message) => {});
sdk.on('response:received', (message: Message) => {});
sdk.on('session:completed', (session: Session) => {});
sdk.on('session:error', (error: Error) => {});
```

## Types and Interfaces

### SDKConfig

Configuration for FabstirSessionSDK:

```typescript
interface SDKConfig {
  contractAddress: string;
  discoveryUrl: string;
  s5SeedPhrase: string;
  s5PortalUrl?: string;
  cacheConfig?: {
    maxEntries?: number;
    ttl?: number;
  };
  enableS5?: boolean;
}
```

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

### Session Types (FabstirSessionSDK)

```typescript
interface Session {
  jobId: number;
  client: string;
  status: string;
  params: SessionParams;
  checkpointCount: number;
  lastCheckpoint: number;
  currentCost: string;
  host: Host;
  messages: Message[];
  websocketUrl: string;
  tokensUsed: number;
}

interface SessionParams {
  duration: number;
  maxInactivity: number;
  messageLimit: number;
  checkpointInterval: number;
}

interface Host {
  id: string;
  address: string;
  url: string;
  models: string[];
  pricePerToken: string;
  available: boolean;
}

interface Message {
  id: string;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface PaymentReceipt {
  sessionId: number;
  totalTokens: number;
  totalCost: string;
  transactionHash: string;
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
- JobMarketplace: `0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A`
- ProofSystem: `0xE7dfB24117a525fCEA51718B1D867a2D779A7Bb9`
- NodeRegistry: `0x87516C13Ea2f99de598665e14cab64E191A0f8c4`
- HostEarnings: `0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E`
- PaymentEscrow: `0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- FAB Token: `0xC78949004B4EB6dEf2D66e49Cd81231472612D62`

### Base Mainnet (Chain ID: 8453)
- JobMarketplace: TBD
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`