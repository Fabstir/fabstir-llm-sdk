# FabstirSDK API Reference

## Table of Contents
- [Installation](#installation)
- [Core SDK](#core-sdk)
- [AuthManager](#authmanager)
- [PaymentManager](#paymentmanager)
- [StorageManager](#storagemanager)
- [DiscoveryManager](#discoverymanager)
- [SessionManager](#sessionmanager)
- [Error Handling](#error-handling)
- [Types and Interfaces](#types-and-interfaces)

## Installation

### Development Setup (npm link)

For local development when working on both fabstir-llm-sdk and fabstir-llm-ui:

```bash
# In fabstir-llm-sdk directory
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk
npm link

# In fabstir-llm-ui directory
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-ui
npm link @fabstir/llm-sdk
```

### Production Setup

Install from GitHub repository:

```bash
npm install git+https://github.com/yourusername/fabstir-llm-sdk.git
```

Or from npm registry (when published):

```bash
npm install @fabstir/llm-sdk
```

## Core SDK

### Import

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
```

### Constructor

```typescript
new FabstirSDK(config?: SDKConfig)
```

Creates a new instance of the FabstirSDK.

**Parameters:**
- `config` (optional): SDK configuration object

**Config Options:**
```typescript
interface SDKConfig {
  rpcUrl?: string;           // RPC URL for blockchain connection
  s5PortalUrl?: string;      // S5 storage portal URL
  contractAddresses?: {
    jobMarketplace?: string;  // JobMarketplace contract address
    nodeRegistry?: string;    // NodeRegistry contract address
    fabToken?: string;        // FAB token address
    usdcToken?: string;       // USDC token address
  };
}
```

**Example:**
```typescript
const sdk = new FabstirSDK({
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/your-key',
  s5PortalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
});
```

### authenticate

```typescript
async authenticate(privateKey: string): Promise<AuthResult>
```

Authenticates the SDK with a private key.

**Parameters:**
- `privateKey`: Ethereum private key (with or without '0x' prefix)

**Returns:** `AuthResult` object containing signer and user information

**Example:**
```typescript
const authResult = await sdk.authenticate('0x1234...');
console.log('Authenticated as:', authResult.userAddress);
```

### Manager Getters

All manager getters require authentication before use.

#### getAuthManager

```typescript
getAuthManager(): AuthManager
```

Returns the AuthManager instance.

#### getPaymentManager

```typescript
getPaymentManager(): PaymentManager
```

Returns the PaymentManager instance. Requires authentication.

#### getStorageManager

```typescript
async getStorageManager(): Promise<StorageManager>
```

Returns the StorageManager instance. Requires authentication. Automatically initializes on first call.

#### getDiscoveryManager

```typescript
getDiscoveryManager(): DiscoveryManager
```

Returns the DiscoveryManager instance. Requires authentication.

#### getSessionManager

```typescript
async getSessionManager(): Promise<SessionManager>
```

Returns the SessionManager instance. Requires authentication. Automatically initializes with all required managers.

## AuthManager

Handles wallet authentication and S5 seed generation.

### authenticate

```typescript
authenticate(provider: 'base' | 'metamask' | 'private-key', options?: AuthOptions): Promise<AuthResult>
```

Authenticates with different providers.

**Parameters:**
- `provider`: Authentication provider type
- `options`: Provider-specific options

**Options:**
```typescript
interface AuthOptions {
  privateKey?: string;  // Required for 'private-key' provider
  rpcUrl?: string;      // Optional RPC URL override
}
```

### getSigner

```typescript
getSigner(): ethers.Signer
```

Returns the authenticated signer. Throws if not authenticated.

### getS5Seed

```typescript
getS5Seed(): string
```

Returns the S5 storage seed. Throws if not authenticated.

### getUserAddress

```typescript
getUserAddress(): string
```

Returns the authenticated user's address. Throws if not authenticated.

### isAuthenticated

```typescript
isAuthenticated(): boolean
```

Returns whether the user is authenticated.

## PaymentManager

Manages ETH and USDC payments for jobs.

### createETHSessionJob

```typescript
createETHSessionJob(
  hostAddress: string,
  amount: string,
  pricePerToken: number,
  duration: number,
  proofInterval: number
): Promise<{ jobId: string; txHash: string }>
```

Creates a new ETH-paid session job.

**Parameters:**
- `hostAddress`: Address of the compute host
- `amount`: ETH amount in ether (e.g., '0.005')
- `pricePerToken`: Price per token in wei
- `duration`: Job duration in seconds
- `proofInterval`: Proof submission interval in seconds

**Returns:** Object with jobId and transaction hash

### approveUSDC

```typescript
approveUSDC(tokenAddress: string, amount: string): Promise<string>
```

Approves USDC spending for the marketplace contract.

**Parameters:**
- `tokenAddress`: USDC token contract address
- `amount`: Amount to approve in USDC (e.g., '100' for 100 USDC)

**Returns:** Transaction hash

### createUSDCSessionJob

```typescript
createUSDCSessionJob(
  hostAddress: string,
  tokenAddress: string,
  amount: string,
  pricePerToken: number,
  duration: number,
  proofInterval: number
): Promise<{ jobId: string; txHash: string }>
```

Creates a new USDC-paid session job.

**Parameters:**
- `hostAddress`: Address of the compute host
- `tokenAddress`: USDC token contract address
- `amount`: USDC amount (e.g., '100' for 100 USDC)
- `pricePerToken`: Price per token in smallest token unit
- `duration`: Job duration in seconds
- `proofInterval`: Proof submission interval in seconds

**Returns:** Object with jobId and transaction hash

### completeSessionJob

```typescript
completeSessionJob(jobId: string): Promise<string>
```

Completes a session job and triggers payment distribution.

**Parameters:**
- `jobId`: The job ID to complete

**Returns:** Transaction hash

## StorageManager

Interfaces with S5 storage for data persistence.

### initialize

```typescript
initialize(authManager: AuthManager): Promise<void>
```

Initializes the storage manager with authentication. Usually called automatically.

### storeData

```typescript
storeData(key: string, data: any, metadata?: Record<string, any>): Promise<string>
```

Stores data in S5 storage.

**Parameters:**
- `key`: Storage key
- `data`: Data to store (will be JSON serialized)
- `metadata`: Optional metadata

**Returns:** Content identifier (CID)

### retrieveData

```typescript
retrieveData(key: string): Promise<any>
```

Retrieves data from S5 storage.

**Parameters:**
- `key`: Storage key

**Returns:** Stored data (JSON parsed)

### listUserData

```typescript
listUserData(): Promise<Array<{ key: string; cid: string; timestamp: number }>>
```

Lists all data stored by the current user.

**Returns:** Array of stored data records

### isInitialized

```typescript
isInitialized(): boolean
```

Returns whether the storage manager is initialized.

## DiscoveryManager

Handles P2P node discovery and communication.

### createNode

```typescript
createNode(options?: DiscoveryOptions): Promise<string>
```

Creates and starts a P2P node.

**Parameters:**
- `options`: Node configuration options

**Options:**
```typescript
interface DiscoveryOptions {
  listen?: string[];     // Listen addresses
  bootstrap?: string[];  // Bootstrap node addresses
}
```

**Returns:** Node's peer ID

### connectToPeer

```typescript
connectToPeer(multiaddr: string): Promise<void>
```

Connects to a peer by multiaddress.

**Parameters:**
- `multiaddr`: Peer's multiaddress (e.g., '/ip4/127.0.0.1/tcp/4001/p2p/12D3...')

### getConnectedPeers

```typescript
getConnectedPeers(): string[]
```

Returns list of connected peer IDs.

### sendMessage

```typescript
sendMessage(peerId: string, message: any): Promise<void>
```

Sends a message to a connected peer.

**Parameters:**
- `peerId`: Target peer ID
- `message`: Message to send (will be JSON serialized)

### onMessage

```typescript
onMessage(handler: (message: any) => void): void
```

Registers a message handler for incoming messages.

**Parameters:**
- `handler`: Function to handle incoming messages

### stop

```typescript
stop(): Promise<void>
```

Stops the P2P node.

### isRunning

```typescript
isRunning(): boolean
```

Returns whether the P2P node is running.

### findHost

```typescript
findHost(criteria: any): Promise<string>
```

Finds a suitable host based on criteria.

**Parameters:**
- `criteria`: Host selection criteria

**Returns:** Host address

## SessionManager

Orchestrates complete session workflows.

### createSession

```typescript
createSession(options: SessionOptions): Promise<SessionResult>
```

Creates a new compute session.

**Parameters:**
```typescript
interface SessionOptions {
  paymentType: 'ETH' | 'USDC';  // Payment type
  amount: string;                // Payment amount
  pricePerToken?: number;        // Price per token (default: 5000)
  duration?: number;             // Duration in seconds (default: 3600)
  proofInterval?: number;        // Proof interval in seconds (default: 300)
  hostAddress?: string;          // Specific host address
  tokenAddress?: string;         // Token address (for USDC)
  hostCriteria?: any;           // Host selection criteria
}
```

**Returns:**
```typescript
interface SessionResult {
  sessionId: string;     // Unique session ID
  jobId: string;        // Blockchain job ID
  hostAddress: string;  // Selected host address
  txHash: string;       // Transaction hash
}
```

### submitProof

```typescript
submitProof(sessionId: string, proofData: any): Promise<string>
```

Submits a proof for a session.

**Parameters:**
- `sessionId`: Session ID
- `proofData`: Proof data

**Returns:** Storage CID

### completeSession

```typescript
completeSession(sessionId: string): Promise<{ 
  txHash: string; 
  paymentDistribution: PaymentDistribution 
}>
```

Completes a session and distributes payments.

**Parameters:**
- `sessionId`: Session ID to complete

**Returns:** Transaction hash and payment distribution

### storeSessionData

```typescript
storeSessionData(sessionId: string, data: any): Promise<string>
```

Stores session-specific data.

**Parameters:**
- `sessionId`: Session ID
- `data`: Data to store

**Returns:** Storage CID

### getSessionData

```typescript
getSessionData(sessionId: string): Promise<any>
```

Retrieves session data.

**Parameters:**
- `sessionId`: Session ID

**Returns:** Session data

### getActiveSessions

```typescript
getActiveSessions(): Promise<string[]>
```

Returns list of active session IDs.

### getSessionStatus

```typescript
getSessionStatus(sessionId: string): Promise<'active' | 'completed' | 'failed'>
```

Gets the status of a session.

**Parameters:**
- `sessionId`: Session ID

**Returns:** Session status

## Error Handling

The SDK uses custom error types with specific error codes:

```typescript
interface SDKError extends Error {
  code?: string;
  details?: any;
}
```

### Common Error Codes

- `AUTH_FAILED`: Authentication failure
- `MANAGER_NOT_INITIALIZED`: Manager not initialized
- `MANAGER_NOT_AUTHENTICATED`: Manager requires authentication
- `INSUFFICIENT_BALANCE`: Insufficient token balance
- `TRANSACTION_FAILED`: Blockchain transaction failed
- `STORAGE_ERROR`: S5 storage error
- `P2P_CONNECTION_ERROR`: P2P connection error
- `SESSION_NOT_FOUND`: Session not found

### Error Handling Example

```typescript
try {
  await sdk.authenticate(privateKey);
  const sessionManager = await sdk.getSessionManager();
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005',
    hostAddress: '0x...'
  });
} catch (error) {
  if (error.code === 'AUTH_FAILED') {
    console.error('Authentication failed:', error.message);
  } else if (error.code === 'INSUFFICIENT_BALANCE') {
    console.error('Insufficient balance:', error.details);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Types and Interfaces

### Core Types

```typescript
// Authentication
interface AuthResult {
  signer: ethers.Signer;
  userAddress: string;
  s5Seed: string;
  network?: {
    chainId: number;
    name: string;
  };
}

// SDK Configuration
interface SDKConfig {
  rpcUrl?: string;
  s5PortalUrl?: string;
  contractAddresses?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    fabToken?: string;
    usdcToken?: string;
  };
}

// Session Management
interface SessionOptions {
  paymentType: 'ETH' | 'USDC';
  amount: string;
  pricePerToken?: number;
  duration?: number;
  proofInterval?: number;
  hostAddress?: string;
  tokenAddress?: string;
  hostCriteria?: any;
}

interface SessionResult {
  sessionId: string;
  jobId: string;
  hostAddress: string;
  txHash: string;
}

interface PaymentDistribution {
  host: string;
  treasury: string;
}
```

## Constants

### Default Values

```typescript
// Payment defaults
MIN_ETH_PAYMENT = '0.005'              // 0.005 ETH minimum
DEFAULT_PRICE_PER_TOKEN = 5000         // 5000 wei per token
DEFAULT_DURATION = 3600                // 1 hour
DEFAULT_PROOF_INTERVAL = 300           // 5 minutes
TOKENS_PER_PROOF = 1000               // Tokens per proof submission

// Payment distribution
PAYMENT_SPLIT = { 
  host: 0.9,      // 90% to host
  treasury: 0.1   // 10% to treasury
}

// Network defaults
BASE_SEPOLIA_CHAIN_ID = 84532
DEFAULT_S5_PORTAL = 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
```

## Complete Example

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';

async function main() {
  // Initialize SDK
  const sdk = new FabstirSDK({
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
    s5PortalUrl: process.env.S5_PORTAL_URL
  });

  // Authenticate
  await sdk.authenticate(process.env.PRIVATE_KEY!);
  
  // Get managers
  const sessionManager = await sdk.getSessionManager();
  const storageManager = await sdk.getStorageManager();
  
  // Create a session
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005',
    pricePerToken: 5000,
    duration: 3600,
    hostAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'
  });
  
  console.log('Session created:', session.sessionId);
  
  // Store session data
  const cid = await storageManager.storeData(
    `session-${session.sessionId}`,
    { prompt: 'Hello, AI!', timestamp: Date.now() }
  );
  
  console.log('Data stored with CID:', cid);
  
  // Complete session
  const completion = await sessionManager.completeSession(session.sessionId);
  console.log('Session completed. Payments distributed:', completion.paymentDistribution);
}

main().catch(console.error);
```