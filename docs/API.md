# Fabstir LLM SDK API Reference

Complete API documentation for the Fabstir LLM SDK, including all public methods, types, events, and error codes.

## Table of Contents

- [FabstirSDK Class](#fabstirsdk-class)
  - [Constructor](#constructor)
  - [Connection Methods](#connection-methods)
  - [Job Methods](#job-methods)
  - [Node Discovery](#node-discovery)
  - [Streaming Methods](#streaming-methods)
  - [System Methods](#system-methods)
  - [Utility Methods](#utility-methods)
- [Events](#events)
- [Types and Interfaces](#types-and-interfaces)
- [Error Codes](#error-codes)
- [Advanced Usage](#advanced-usage)

## FabstirSDK Class

The main class for interacting with the Fabstir LLM Marketplace on Base Sepolia. Supports USDC and ETH payments for AI inference jobs.

### Constructor

```typescript
new FabstirSDK(config?: SDKConfig)
```

Creates a new instance of the SDK.

**Parameters:**
- `config` (optional): SDK configuration object

**Example:**
```typescript
const sdk = new FabstirSDK({
  network: "base-sepolia",
  contracts: {
    jobMarketplace: "0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6",
    paymentEscrow: "0x4B7f...", // Check actual deployment
    usdc: "0x...", // Base Sepolia USDC address
  },
  rpcUrl: process.env.RPC_URL || "https://sepolia.base.org",
  debug: true,
});
```

### Connection Methods

#### connect(provider)

Connects the SDK to a wallet provider.

```typescript
async connect(provider: ethers.providers.Provider): Promise<void>
```

**Parameters:**
- `provider`: An ethers.js provider instance

**Example:**
```typescript
const provider = new ethers.providers.Web3Provider(window.ethereum);
await sdk.connect(provider);
```

**Events Emitted:**
- `connected`: When successfully connected
- `p2p:started`: When P2P client is initialized (production mode)

#### disconnect()

Disconnects the SDK and cleans up resources.

```typescript
async disconnect(): Promise<void>
```

**Example:**
```typescript
await sdk.disconnect();
```

**Events Emitted:**
- `disconnected`: When disconnected

#### isConnected

Property that indicates connection status.

```typescript
get isConnected(): boolean
```

**Example:**
```typescript
if (sdk.isConnected) {
  console.log("SDK is connected");
}
```

### Job Methods

#### postJobWithToken(jobDetails, requirements, paymentToken, paymentAmount)

Submits a job with USDC or ETH payment to the marketplace.

```typescript
async postJobWithToken(
  jobDetails: JobDetails,
  requirements: JobRequirements,
  paymentToken: string,  // USDC or ETH address
  paymentAmount: bigint
): Promise<ContractTransaction>
```

**Parameters:**
- `jobDetails`: Job details struct (6 fields, order matters!)
- `requirements`: Job requirements including trusted execution settings
- `paymentToken`: Address of payment token (USDC or ETH)
- `paymentAmount`: Payment amount in token units

**Returns:** Contract transaction

**Example:**
```typescript
// First approve USDC if needed
const approveTx = await sdk.approveUSDC(ethers.parseUnits('10', 6));
await approveTx.wait();

// Submit job with USDC payment
const tx = await sdk.postJobWithToken(
  {
    requester: userAddress,
    model: 'gpt-4',
    prompt: 'Explain quantum computing',
    offerPrice: ethers.parseUnits('5', 6), // 5 USDC
    maxTokens: 200n,
    seed: 0n
  },
  { trustedExecution: false },
  USDC_ADDRESS,
  ethers.parseUnits('5', 6)
);
await tx.wait();
```

#### submitJob(params) [DEPRECATED]

⚠️ **Deprecated**: Use `postJobWithToken` instead. This method only supported FAB token payments which are no longer used.

```typescript
async submitJob(params: JobSubmissionRequest): Promise<number>
```

#### submitJobWithNegotiation(params)

Submits a job with P2P negotiation for best pricing and node selection.

```typescript
async submitJobWithNegotiation(params: NegotiationOptions): Promise<{
  jobId: number;
  selectedNode: string;
  negotiatedPrice: BigNumber;
  txHash?: string;
  stream?: P2PResponseStream;
  p2pOnly?: boolean;
}>
```

**Parameters:**
- `params`: Negotiation parameters

**Returns:** Job submission result with negotiation details

**Example:**
```typescript
const result = await sdk.submitJobWithNegotiation({
  prompt: "Write a poem about AI",
  modelId: "llama-3.2-1b-instruct",
  maxTokens: 100,
  maxBudget: ethers.utils.parseEther("0.01"),
  preferredNodes: ["12D3KooWNode1"],
  stream: true,
  submitToChain: true,
});

console.log(`Job ${result.jobId} submitted to ${result.selectedNode}`);
console.log(`Price: ${ethers.utils.formatEther(result.negotiatedPrice)} ETH`);
```

**Events Emitted:**
- `job:negotiating`: When negotiation starts
- `job:negotiated`: When negotiation completes
- `job:submitted`: When job is submitted

#### submitJobWithRetry(params, retryOptions)

Submits a job with automatic retry on failure.

```typescript
async submitJobWithRetry(
  params: JobSubmissionRequest,
  retryOptions?: RetryOptions
): Promise<number>
```

**Parameters:**
- `params`: Job submission parameters
- `retryOptions`: Retry configuration

**Returns:** Job ID

**Example:**
```typescript
const jobId = await sdk.submitJobWithRetry(
  {
    prompt: "Complex calculation",
    modelId: "llama-3.2-1b-instruct",
    maxTokens: 500,
  },
  {
    maxRetries: 3,
    initialDelay: 1000,
    shouldRetry: (error, attempt) => {
      return error.message.includes("timeout") && attempt < 3;
    },
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt} due to:`, error.message);
    },
  }
);
```

#### getJobStatus(jobId)

Gets the current status of a job.

```typescript
async getJobStatus(jobId: number): Promise<{
  status: JobStatus;
  nodeAddress?: string;
  progress?: number;
  error?: string;
  confirmations?: number;
}>
```

**Parameters:**
- `jobId`: The job ID to check

**Returns:** Job status information

**Example:**
```typescript
const status = await sdk.getJobStatus(123);
console.log("Status:", status.status); // "POSTED", "PROCESSING", "COMPLETED", etc.
```

#### getJobResult(jobId)

Gets the result of a completed job.

```typescript
async getJobResult(jobId: number): Promise<JobResult>
```

**Parameters:**
- `jobId`: The job ID

**Returns:** Job result with response and metadata

**Example:**
```typescript
const result = await sdk.getJobResult(123);
console.log("Response:", result.response);
console.log("Tokens used:", result.tokensUsed);
console.log("Inference time:", result.inferenceTime, "ms");
```

#### approveUSDC(amount)

Approves USDC spending for the JobMarketplace contract.

```typescript
async approveUSDC(amount: bigint): Promise<ContractTransaction>
```

**Parameters:**
- `amount`: Amount to approve in USDC units (6 decimals)

**Returns:** Approval transaction

**Example:**
```typescript
// Approve 100 USDC
const tx = await sdk.approveUSDC(ethers.parseUnits('100', 6));
await tx.wait();
```

#### checkUSDCAllowance(owner)

Checks the current USDC allowance for a user.

```typescript
async checkUSDCAllowance(owner: string): Promise<bigint>
```

**Parameters:**
- `owner`: Wallet address to check

**Returns:** Current allowance in USDC units

**Example:**
```typescript
const allowance = await sdk.checkUSDCAllowance(userAddress);
if (allowance < jobCost) {
  // Need to approve more USDC
  await sdk.approveUSDC(jobCost);
}
```

#### claimJob(jobId)

Allows a host to claim a posted job for processing.

```typescript
async claimJob(jobId: string): Promise<ContractTransaction>
```

**Parameters:**
- `jobId`: The job ID to claim

**Returns:** Claim transaction

**Example:**
```typescript
const tx = await sdk.claimJob('123');
await tx.wait();
```

#### completeJob(jobId, result)

Submits the result for a claimed job.

```typescript
async completeJob(jobId: string, result: string): Promise<ContractTransaction>
```

**Parameters:**
- `jobId`: The job ID
- `result`: The inference result

**Returns:** Completion transaction

**Example:**
```typescript
const tx = await sdk.completeJob('123', 'Quantum computing is...');
await tx.wait();
// Payment automatically released: 90% to host, 10% to treasury
```

#### cancelJob(jobId)

Cancels a pending or processing job.

```typescript
async cancelJob(jobId: number): Promise<void>
```

**Parameters:**
- `jobId`: The job ID to cancel

**Example:**
```typescript
await sdk.cancelJob(123);
```

**Events Emitted:**
- `job:cancelled`: When job is cancelled

### Node Discovery

#### discoverNodes(options)

Discovers available nodes based on criteria.

```typescript
async discoverNodes(options: NodeDiscoveryOptions): Promise<DiscoveredNode[]>
```

**Parameters:**
- `options`: Discovery criteria

**Returns:** Array of discovered nodes

**Example:**
```typescript
const nodes = await sdk.discoverNodes({
  modelId: "llama-3.2-1b-instruct",
  maxLatency: 100,        // Max 100ms latency
  minReputation: 85,      // Min reputation score
  maxPrice: "2000000",    // Max price per token in wei
  excludeNodes: ["12D3KooWBadNode"],
});

nodes.forEach(node => {
  console.log(`Node ${node.peerId}:`);
  console.log(`  Models: ${node.capabilities.models.join(", ")}`);
  console.log(`  Price: ${node.capabilities.pricePerToken} wei/token`);
  console.log(`  Latency: ${node.latency}ms`);
});
```

#### getNodeInfo(nodeId)

Gets detailed information about a specific node.

```typescript
async getNodeInfo(nodeId: string): Promise<NodeInfo>
```

**Parameters:**
- `nodeId`: The node's peer ID

**Returns:** Node information

**Example:**
```typescript
const info = await sdk.getNodeInfo("12D3KooWNode1");
console.log("Reputation:", info.reputation);
console.log("Completed jobs:", info.completedJobs);
```

#### getNodeReliability(nodeId)

Gets reliability metrics for a node.

```typescript
async getNodeReliability(nodeId: string): Promise<NodeReliabilityRecord>
```

**Parameters:**
- `nodeId`: The node's peer ID

**Returns:** Node reliability record

**Example:**
```typescript
const reliability = await sdk.getNodeReliability("12D3KooWNode1");
console.log("Success rate:", reliability.successRate, "%");
console.log("Average response time:", reliability.averageResponseTime, "ms");
```

### Streaming Methods

#### createResponseStream(options)

Creates a streaming response for a job.

```typescript
async createResponseStream(options: ResponseStreamOptions): Promise<P2PResponseStream>
```

**Parameters:**
- `options`: Stream configuration

**Returns:** Response stream object

**Example:**
```typescript
const stream = await sdk.createResponseStream({
  jobId: "job-123",
  requestId: "req-123",
  resumeFrom: 0,
});

stream.on("token", (token) => {
  console.log("Token:", token.content);
});

stream.on("end", (summary) => {
  console.log("Total tokens:", summary.totalTokens);
});

stream.on("error", (error) => {
  console.error("Stream error:", error);
});

// Control the stream
stream.pause();
stream.resume();
stream.close();
```

#### resumeResponseStream(options)

Resumes an interrupted response stream.

```typescript
async resumeResponseStream(options: {
  jobId: string;
  requestId: string;
  resumeFrom: number;
}): Promise<P2PResponseStream>
```

**Parameters:**
- `options`: Resume configuration with checkpoint

**Returns:** Resumed response stream

**Example:**
```typescript
const stream = await sdk.resumeResponseStream({
  jobId: "job-123",
  requestId: "req-123",
  resumeFrom: 150, // Resume from token 150
});
```

### System Methods

#### getSystemHealthReport()

Gets comprehensive system health information.

```typescript
async getSystemHealthReport(): Promise<SystemHealthReport>
```

**Returns:** System health report

**Example:**
```typescript
const health = await sdk.getSystemHealthReport();

console.log("Status:", health.status); // "healthy", "degraded", "unhealthy"
console.log("Mode:", health.mode);     // "mock" or "production"

if (health.status !== "healthy") {
  console.log("Issues:", health.issues);
  console.log("Recommendations:", health.recommendations);
}
```

#### getPerformanceMetrics()

Gets performance metrics for the SDK.

```typescript
async getPerformanceMetrics(): Promise<PerformanceMetrics>
```

**Returns:** Performance metrics

**Example:**
```typescript
const metrics = await sdk.getPerformanceMetrics();

console.log("Total operations:", metrics.totalOperations);
console.log("Connect avg time:", metrics.operations.connect.averageTime, "ms");
console.log("Discovery avg time:", metrics.operations.discover.averageTime, "ms");
console.log("Token latency:", metrics.streaming.averageTokenLatency, "ms");
```

#### transitionMode(options)

Transitions between mock and production modes.

```typescript
async transitionMode(options: ModeTransitionOptions): Promise<ModeTransitionReport>
```

**Parameters:**
- `options`: Mode transition configuration

**Returns:** Transition report

**Example:**
```typescript
const report = await sdk.transitionMode({
  from: "mock",
  to: "production",
  preserveState: true,
  migrateJobs: true,
});

console.log("Success:", report.success);
console.log("Jobs migrated:", report.jobsMigrated);
```

### Utility Methods

#### getNetwork()

Gets the current network information.

```typescript
async getNetwork(): Promise<{ name: string; chainId: number }>
```

**Example:**
```typescript
const network = await sdk.getNetwork();
console.log("Network:", network.name); // "base-sepolia"
```

#### getAddress()

Gets the connected wallet address.

```typescript
async getAddress(): Promise<string>
```

**Example:**
```typescript
const address = await sdk.getAddress();
console.log("Wallet:", address);
```

#### getBalance()

Gets the wallet's ETH balance.

```typescript
async getBalance(): Promise<BigNumber>
```

**Example:**
```typescript
const balance = await sdk.getBalance();
console.log("Balance:", ethers.utils.formatEther(balance), "ETH");
```

#### getContractAddresses()

Gets deployed contract addresses.

```typescript
async getContractAddresses(): Promise<{
  jobMarketplace: string;
  paymentEscrow: string;
  nodeRegistry: string;
}>
```

**Example:**
```typescript
const contracts = await sdk.getContractAddresses();
console.log("Job Marketplace:", contracts.jobMarketplace);
```

## Events

The SDK emits various events for monitoring operations:

### Connection Events

```typescript
sdk.on("connected", (data: { address: string; network: string }) => {
  console.log("Connected:", data);
});

sdk.on("disconnected", () => {
  console.log("Disconnected");
});

sdk.on("p2p:started", () => {
  console.log("P2P client started");
});
```

### Job Events

```typescript
sdk.on("job:submitted", (data: { jobId: number; nodeId?: string }) => {
  console.log("Job submitted:", data);
});

sdk.on("job:negotiated", (data: { 
  jobId: string; 
  selectedNode: string; 
  price: BigNumber 
}) => {
  console.log("Job negotiated:", data);
});

sdk.on("job:completed", (data: { 
  jobId: number; 
  resultHash: string 
}) => {
  console.log("Job completed:", data);
});

sdk.on("job:failed", (data: { 
  jobId: number; 
  error: string 
}) => {
  console.error("Job failed:", data);
});

sdk.on("job:failover", (data: {
  originalNode: string;
  newNode: string;
  reason: string;
  jobId: string;
}) => {
  console.log("Job failover:", data);
});
```

### Node Events

```typescript
sdk.on("node:discovered", (nodes: DiscoveredNode[]) => {
  console.log(`Discovered ${nodes.length} nodes`);
});

sdk.on("node:failure", (data: {
  nodeId: string;
  reason: string;
  activeJobs: number[];
}) => {
  console.error("Node failure:", data);
});

sdk.on("node:reliability-alert", (data: {
  nodeId: string;
  reliability: number;
  threshold: number;
  action: string;
}) => {
  console.warn("Reliability alert:", data);
});
```

### Stream Events

```typescript
// On stream object
stream.on("token", (token: StreamToken) => {
  console.log("Token:", token.content);
});

stream.on("end", (summary: StreamEndSummary) => {
  console.log("Stream ended:", summary);
});

stream.on("error", (error: StreamError) => {
  console.error("Stream error:", error);
});

stream.on("metrics", (metrics: StreamMetrics) => {
  console.log("Stream metrics:", metrics);
});
```

### Payment Events

```typescript
sdk.on("payment:escrowed", (data: {
  jobId: number;
  amount: BigNumber;
  token: string;  // USDC or ETH address
}) => {
  console.log("Payment escrowed:", data);
});

sdk.on("payment:released", (data: {
  jobId: number;
  amount: BigNumber;
  recipient: string;
}) => {
  console.log("Payment released:", data);
  // Note: 90% goes to host, 10% to treasury
});

sdk.on("payment:disputed", (data: {
  jobId: number;
  reason: string;
  initiator: string;
}) => {
  console.log("Payment disputed:", data);
});

// USDC-specific events
sdk.on("usdc:approved", (data: {
  amount: BigNumber;
  spender: string;
}) => {
  console.log("USDC approved:", data);
});
```

## Types and Interfaces

### SDKConfig

```typescript
interface SDKConfig {
  network?: string;  // "base-sepolia" for production
  contracts?: {
    jobMarketplace?: string;  // Core marketplace contract
    paymentEscrow?: string;   // Handles USDC/ETH payments
    usdc?: string;           // USDC token address
    fab?: string;            // FAB token (governance only, NOT for payments)
  };
  rpcUrl?: string;  // Base Sepolia RPC URL
  retryOptions?: RetryOptions;
  debug?: boolean;
  enablePerformanceTracking?: boolean;
}
```

### JobDetails

**IMPORTANT**: Field order must match Solidity struct exactly!

```typescript
interface JobDetails {
  requester: string;     // User's wallet address
  model: string;         // Model ID (e.g., "gpt-4")
  prompt: string;        // The prompt text
  offerPrice: bigint;    // Payment amount in token units
  maxTokens: bigint;     // Maximum tokens for response
  seed: bigint;          // Random seed for reproducibility
}
```

### JobRequirements

```typescript
interface JobRequirements {
  trustedExecution: boolean;  // Whether TEE is required
  // Additional requirements as needed
}
```

### JobSubmissionRequest [DEPRECATED]

⚠️ **Deprecated**: Use `JobDetails` with `postJobWithToken` instead.

```typescript
interface JobSubmissionRequest {
  prompt: string;
  modelId: string;
  maxTokens: number;
  temperature?: number;
  paymentToken?: string;
  maxPrice?: BigNumber;
  metadata?: Record<string, any>;
  stream?: boolean;
}
```

### NegotiationOptions

```typescript
interface NegotiationOptions {
  modelId: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  maxNodes?: number;
  maxBudget?: BigNumber;
  maxRetries?: number;
  submitToChain?: boolean;
  paymentToken?: string;
  allowP2PFallback?: boolean;
  preferredNodes?: string[];
  stream?: boolean;
}
```

### DiscoveredNode

```typescript
interface DiscoveredNode {
  peerId: string;
  multiaddrs: string[];
  capabilities: NodeCapabilities;
  latency?: number;
  reputation?: number;
  lastSeen: number;
}

interface NodeCapabilities {
  models: string[];
  maxTokens: number;
  pricePerToken: string;
  computeType?: string;
  gpuModel?: string;
  maxConcurrentJobs?: number;
}
```

### P2PResponseStream

```typescript
interface P2PResponseStream {
  jobId: string;
  nodeId: string;
  status: "active" | "paused" | "closed" | "error";
  
  on(event: "token", listener: (token: StreamToken) => void): void;
  on(event: "end", listener: (summary: StreamEndSummary) => void): void;
  on(event: "error", listener: (error: StreamError) => void): void;
  on(event: "metrics", listener: (metrics: StreamMetrics) => void): void;
  
  pause(): void;
  resume(): void;
  close(): void;
  getMetrics(): StreamMetrics;
}
```

### JobStatus Enum

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

## Error Codes

The SDK uses custom error codes for different failure scenarios:

### FabstirError

```typescript
class FabstirError extends Error {
  code: ErrorCode;
  details?: any;
}
```

### ErrorCode Enum

```typescript
enum ErrorCode {
  // Connection errors
  CONNECTION_FAILED = "CONNECTION_FAILED",
  NETWORK_MISMATCH = "NETWORK_MISMATCH",
  WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED",
  
  // Job errors
  JOB_NOT_FOUND = "JOB_NOT_FOUND",
  JOB_SUBMISSION_FAILED = "JOB_SUBMISSION_FAILED",
  JOB_ALREADY_CLAIMED = "JOB_ALREADY_CLAIMED",
  
  // Node errors
  NO_NODES_AVAILABLE = "NO_NODES_AVAILABLE",
  NODE_NOT_RESPONDING = "NODE_NOT_RESPONDING",
  NODE_REJECTED_JOB = "NODE_REJECTED_JOB",
  
  // Payment errors
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  INSUFFICIENT_ALLOWANCE = "INSUFFICIENT_ALLOWANCE",  // USDC not approved
  PAYMENT_FAILED = "PAYMENT_FAILED",
  ESCROW_FAILED = "ESCROW_FAILED",
  INVALID_PAYMENT_TOKEN = "INVALID_PAYMENT_TOKEN",  // Not USDC or ETH
  
  // P2P errors
  P2P_CONNECTION_FAILED = "P2P_CONNECTION_FAILED",
  P2P_DISCOVERY_FAILED = "P2P_DISCOVERY_FAILED",
  P2P_TIMEOUT = "P2P_TIMEOUT",
  
  // Stream errors
  STREAM_CONNECTION_LOST = "STREAM_CONNECTION_LOST",
  STREAM_INVALID_TOKEN = "STREAM_INVALID_TOKEN",
  STREAM_RATE_LIMITED = "STREAM_RATE_LIMITED",
  
  // General errors
  INVALID_PARAMETERS = "INVALID_PARAMETERS",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
```

### Error Handling Examples

```typescript
try {
  const jobId = await sdk.submitJob(params);
} catch (error) {
  if (error instanceof FabstirError) {
    switch (error.code) {
      case ErrorCode.NO_NODES_AVAILABLE:
        console.error("No nodes available for model:", params.modelId);
        // Try different model or wait
        break;
        
      case ErrorCode.INSUFFICIENT_BALANCE:
        console.error("Insufficient balance:", error.details);
        // Top up wallet with USDC or ETH
        break;
        
      case ErrorCode.INSUFFICIENT_ALLOWANCE:
        console.error("USDC not approved:", error.details);
        // Call approveUSDC() first
        await sdk.approveUSDC(requiredAmount);
        break;
        
      case ErrorCode.P2P_TIMEOUT:
        console.error("P2P timeout - retrying...");
        // Retry with longer timeout
        break;
        
      default:
        console.error("SDK error:", error.code, error.message);
    }
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Payment Flow Examples

### Complete USDC Payment Flow

```typescript
// 1. Check USDC balance (optional)
const usdcBalance = await sdk.getUSDCBalance(userAddress);
console.log('USDC Balance:', ethers.formatUnits(usdcBalance, 6));

// 2. Check and approve USDC if needed
const jobCost = ethers.parseUnits('10', 6); // 10 USDC
const allowance = await sdk.checkUSDCAllowance(userAddress);

if (allowance < jobCost) {
  console.log('Approving USDC...');
  const approveTx = await sdk.approveUSDC(jobCost);
  await approveTx.wait();
  console.log('USDC approved');
}

// 3. Submit job with USDC payment
const jobTx = await sdk.postJobWithToken(
  {
    requester: userAddress,
    model: 'gpt-4',
    prompt: 'Write a haiku about blockchain',
    offerPrice: jobCost,
    maxTokens: 100n,
    seed: 0n
  },
  { trustedExecution: false },
  USDC_ADDRESS,
  jobCost
);

const receipt = await jobTx.wait();
console.log('Job submitted:', receipt.transactionHash);

// 4. USDC is now in escrow
// 5. Host claims and processes job
// 6. Payment automatically released: 90% to host, 10% to treasury
```

### ETH Payment Flow

```typescript
// ETH payments don't require approval
const jobCost = ethers.parseEther('0.01'); // 0.01 ETH

const jobTx = await sdk.postJobWithToken(
  {
    requester: userAddress,
    model: 'gpt-4',
    prompt: 'Explain Web3',
    offerPrice: jobCost,
    maxTokens: 200n,
    seed: 0n
  },
  { trustedExecution: false },
  ETH_ADDRESS, // Or use ethers.constants.AddressZero
  jobCost
);

await jobTx.wait();
```

### Important Notes on FAB Tokens

⚠️ **FAB tokens are NOT used for payments anymore!** They are only used for:
- Governance voting
- Node staking
- Platform incentives

If you see any code using FAB for job payments, it is outdated and should be updated to use USDC or ETH.

## Advanced Usage

### Custom Event Handlers

```typescript
// Create event handler class
class JobMonitor {
  constructor(private sdk: FabstirSDK) {
    this.setupListeners();
  }
  
  private setupListeners() {
    this.sdk.on("job:submitted", this.onJobSubmitted.bind(this));
    this.sdk.on("job:completed", this.onJobCompleted.bind(this));
    this.sdk.on("job:failed", this.onJobFailed.bind(this));
  }
  
  private async onJobSubmitted(data: { jobId: number }) {
    console.log(`Job ${data.jobId} submitted at ${new Date()}`);
    // Start monitoring
  }
  
  private async onJobCompleted(data: { jobId: number }) {
    const result = await this.sdk.getJobResult(data.jobId);
    console.log(`Job ${data.jobId} completed:`, result.tokensUsed, "tokens");
  }
  
  private async onJobFailed(data: { jobId: number; error: string }) {
    console.error(`Job ${data.jobId} failed:`, data.error);
    // Implement retry logic
  }
}

// Use the monitor
const monitor = new JobMonitor(sdk);
```

### Batch Operations

```typescript
// Submit multiple jobs concurrently
async function batchSubmit(prompts: string[]) {
  const jobs = prompts.map(prompt => ({
    prompt,
    modelId: "llama-3.2-1b-instruct",
    maxTokens: 100,
  }));
  
  const results = await Promise.allSettled(
    jobs.map(job => sdk.submitJobWithNegotiation(job))
  );
  
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`Job ${index}: ${result.value.jobId}`);
    } else {
      console.error(`Job ${index} failed:`, result.reason);
    }
  });
}
```

### Custom Retry Logic

```typescript
// Implement exponential backoff with jitter
async function submitWithCustomRetry(params: JobSubmissionRequest) {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await sdk.submitJob(params);
    } catch (error) {
      lastError = error;
      
      if (error.code === ErrorCode.NO_NODES_AVAILABLE && attempt < 5) {
        // Wait with exponential backoff + jitter
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        const jitter = Math.random() * 1000;
        
        console.log(`Retry ${attempt} in ${delay + jitter}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        
        // Force node rediscovery
        await sdk.discoverNodes({
          modelId: params.modelId,
          forceRefresh: true,
        });
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}
```

### Performance Optimization

```typescript
// Pre-discover nodes for better performance
class OptimizedClient {
  private nodeCache = new Map<string, DiscoveredNode[]>();
  
  constructor(private sdk: FabstirSDK) {}
  
  async warmup(modelIds: string[]) {
    // Pre-discover nodes for each model
    const discoveries = modelIds.map(async modelId => {
      const nodes = await this.sdk.discoverNodes({ modelId });
      this.nodeCache.set(modelId, nodes);
      return nodes;
    });
    
    await Promise.all(discoveries);
  }
  
  async submitJob(params: JobSubmissionRequest) {
    // Use cached nodes for faster submission
    const cachedNodes = this.nodeCache.get(params.modelId);
    
    if (cachedNodes && cachedNodes.length > 0) {
      // Select best node from cache
      const bestNode = cachedNodes.reduce((best, node) => 
        node.latency < best.latency ? node : best
      );
      
      return sdk.submitJobWithNegotiation({
        ...params,
        preferredNodes: [bestNode.peerId],
      });
    }
    
    // Fallback to normal submission
    return sdk.submitJobWithNegotiation(params);
  }
}
```

### Stream Processing Pipeline

```typescript
// Create a processing pipeline for streamed responses
class StreamProcessor {
  private buffer: string = "";
  private wordCount: number = 0;
  
  async processStream(stream: P2PResponseStream) {
    return new Promise((resolve, reject) => {
      stream.on("token", (token) => {
        this.buffer += token.content;
        
        // Process complete words
        const words = this.buffer.split(/\s+/);
        if (words.length > 1) {
          const completeWords = words.slice(0, -1);
          this.processWords(completeWords);
          this.buffer = words[words.length - 1];
        }
      });
      
      stream.on("end", (summary) => {
        // Process remaining buffer
        if (this.buffer) {
          this.processWords([this.buffer]);
        }
        
        resolve({
          totalWords: this.wordCount,
          totalTokens: summary.totalTokens,
        });
      });
      
      stream.on("error", reject);
    });
  }
  
  private processWords(words: string[]) {
    words.forEach(word => {
      this.wordCount++;
      // Additional processing: sentiment, filtering, etc.
      console.log(`Word ${this.wordCount}: ${word}`);
    });
  }
}

// Usage
const processor = new StreamProcessor();
const result = await sdk.submitJobWithNegotiation({
  prompt: "Tell me a story",
  modelId: "llama-3.2-1b-instruct",
  maxTokens: 500,
  stream: true,
});

if (result.stream) {
  const stats = await processor.processStream(result.stream);
  console.log("Processing complete:", stats);
}
```