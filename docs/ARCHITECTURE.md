# Fabstir LLM SDK Architecture

This document provides a comprehensive overview of the Fabstir LLM SDK architecture, including system components, data flows, and design decisions.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [P2P Discovery Process](#p2p-discovery-process)
- [Job Lifecycle](#job-lifecycle)
- [Contract Interaction Flow](#contract-interaction-flow)
- [Streaming Protocol](#streaming-protocol)
- [Security Architecture](#security-architecture)
- [Performance Considerations](#performance-considerations)

## System Overview

The Fabstir LLM SDK provides a decentralized marketplace for AI inference jobs on Base Sepolia. The system connects users who need AI inference with hosts who provide compute resources, using:

- **Base Sepolia** for low-cost, fast blockchain transactions
- **USDC/ETH payments** for job compensation (FAB tokens are only for governance)
- **Smart contracts** for trustless job posting and payment escrow
- **PaymentEscrow** for secure fund management with automatic distribution
- **P2P architecture** (planned) for direct node communication

### Key Design Principles

1. **Decentralization**: No single point of failure or control
2. **Trustless**: Smart contracts ensure fair payment and delivery
3. **Scalable**: P2P architecture scales with network size
4. **Resilient**: Automatic failover and recovery mechanisms
5. **Privacy-Preserving**: Direct connections minimize data exposure

## Architecture Diagram

```mermaid
graph TB
    subgraph Client Layer
        SDK[Fabstir SDK]
        APP[Application]
    end

    subgraph P2P Network
        DHT[DHT Network]
        BOOTSTRAP[Bootstrap Nodes]
        PEERS[Peer Nodes]
    end

    subgraph Blockchain[Base Sepolia]
        JM[Job Marketplace]
        PE[Payment Escrow]
        USDC[USDC Token]
        FAB[FAB Token - Governance Only]
    end

    subgraph Storage
        IPFS[IPFS/S5 Network]
    end

    subgraph LLM Nodes
        NODE1[LLM Node 1]
        NODE2[LLM Node 2]
        NODE3[LLM Node N]
    end

    APP --> SDK
    SDK <--> DHT
    SDK <--> BOOTSTRAP
    SDK <--> PEERS
    SDK <--> JM
    SDK <--> PE
    SDK <--> USDC
    JM <--> PE
    PE <--> USDC
    SDK <--> NODE1
    SDK <--> NODE2
    SDK <--> NODE3
    NODE1 <--> IPFS
    NODE2 <--> IPFS
    NODE3 <--> IPFS
```

## Core Components

### 1. FabstirSDK

The main entry point that orchestrates all operations:

```typescript
class FabstirSDK extends EventEmitter {
  // Core properties
  private provider: ethers.providers.Provider;
  private contracts: ContractManager;
  private p2pClient: P2PClient;
  private config: SDKConfig;
  
  // State management
  private jobs: Map<number, JobState>;
  private nodes: Map<string, NodeInfo>;
  private streams: Map<string, P2PResponseStream>;
}
```

**Responsibilities:**
- Connection management
- Job submission and monitoring
- Node discovery and selection
- Event emission and handling
- Mode switching (mock/production)

### 2. P2PClient

Handles all peer-to-peer networking:

```typescript
class P2PClient {
  private libp2p: Libp2p;
  private discovery: PeerDiscovery;
  private protocols: Map<string, Protocol>;
  
  // Core P2P operations
  async findProviders(query: ProviderQuery): Promise<DiscoveredNode[]>
  async sendJobRequest(nodeId: string, request: JobRequest): Promise<JobResponse>
  async createStream(nodeId: string, options: StreamOptions): Promise<Stream>
}
```

**Key Features:**
- DHT-based peer discovery
- Direct node communication
- Stream multiplexing
- Connection management
- Protocol negotiation

### 3. ContractManager

Interfaces with Base Sepolia smart contracts:

```typescript
class ContractManager {
  private jobMarketplace: JobMarketplace;
  private paymentEscrow: PaymentEscrow;
  private usdcToken: IERC20;
  
  // Core contract interactions
  async approveUSDC(amount: bigint): Promise<ContractTransaction>
  async postJobWithToken(
    jobDetails: JobDetails,
    requirements: JobRequirements,
    paymentToken: string,  // USDC or ETH address
    paymentAmount: bigint
  ): Promise<ContractTransaction>
  async claimJob(jobId: string): Promise<ContractTransaction>
  async completeJob(jobId: string, result: string): Promise<ContractTransaction>
}
```

**Contract Interactions:**
- USDC approval for spending
- Job posting with USDC/ETH payment
- Payment escrow and automatic release (90% host, 10% treasury)
- Job claiming and completion

### 4. StreamManager

Manages real-time response streaming:

```typescript
class StreamManager {
  private streams: Map<string, StreamState>;
  private buffers: Map<string, Buffer>;
  
  // Stream operations
  createStream(jobId: string, nodeId: string): P2PResponseStream
  handleIncomingData(streamId: string, data: Uint8Array): void
  resumeStream(streamId: string, checkpoint: number): void
}
```

## P2P Discovery Process

The SDK uses a multi-layered approach for discovering LLM nodes:

### 1. Bootstrap Connection

```mermaid
sequenceDiagram
    participant SDK
    participant Bootstrap
    participant DHT
    
    SDK->>Bootstrap: Connect to bootstrap nodes
    Bootstrap->>SDK: Return peer list
    SDK->>DHT: Join DHT network
    DHT->>SDK: Routing table established
```

### 2. Provider Discovery

```mermaid
sequenceDiagram
    participant SDK
    participant DHT
    participant Providers
    
    SDK->>DHT: Query for model providers
    DHT->>DHT: Search routing table
    DHT->>Providers: Discover matching nodes
    Providers->>SDK: Return capabilities
    SDK->>SDK: Filter and rank nodes
```

### 3. Node Selection Algorithm

```typescript
function selectOptimalNode(nodes: DiscoveredNode[], criteria: SelectionCriteria): DiscoveredNode {
  // 1. Filter by requirements
  const eligible = nodes.filter(node => 
    node.capabilities.models.includes(criteria.modelId) &&
    node.latency <= criteria.maxLatency &&
    parseInt(node.capabilities.pricePerToken) <= criteria.maxPrice
  );
  
  // 2. Score nodes
  const scored = eligible.map(node => ({
    node,
    score: calculateScore(node, criteria)
  }));
  
  // 3. Select best node
  return scored.sort((a, b) => b.score - a.score)[0].node;
}

function calculateScore(node: DiscoveredNode, criteria: SelectionCriteria): number {
  const latencyScore = 1 - (node.latency / criteria.maxLatency);
  const reputationScore = node.reputation / 100;
  const priceScore = 1 - (parseInt(node.capabilities.pricePerToken) / criteria.maxPrice);
  
  // Weighted scoring
  return (latencyScore * 0.3) + (reputationScore * 0.5) + (priceScore * 0.2);
}
```

## Job Lifecycle

A job goes through multiple stages from submission to completion:

### 1. Job Submission Flow with USDC/ETH Payment

```mermaid
stateDiagram-v2
    [*] --> ApproveUSDC: If Using USDC
    [*] --> PostJob: If Using ETH
    ApproveUSDC --> PostJob: USDC Approved
    PostJob --> Posted: Job Posted with Payment
    Posted --> Escrowed: Payment in Escrow
    Escrowed --> Claimed: Host Claims Job
    Claimed --> Processing: Start Processing
    Processing --> Completed: Job Completed
    Completed --> PaymentReleased: 90% to Host, 10% to Treasury
    PaymentReleased --> [*]: Job Done
    
    Processing --> Failed: Processing Error
    Failed --> Refunded: Payment Refunded
    Refunded --> [*]: Job Failed
```

### 2. Detailed Job Flow with USDC Payment

```mermaid
sequenceDiagram
    participant Client
    participant SDK
    participant USDC
    participant JobMarketplace
    participant PaymentEscrow
    participant Host
    participant Treasury
    
    Client->>SDK: submitJob(jobDetails)
    
    alt USDC Payment
        SDK->>USDC: checkAllowance()
        USDC->>SDK: currentAllowance
        
        alt Insufficient Allowance
            SDK->>USDC: approve(JobMarketplace, amount)
            USDC->>SDK: approved
        end
    end
    
    SDK->>JobMarketplace: postJobWithToken(details, USDC, amount)
    JobMarketplace->>USDC: transferFrom(client, escrow, amount)
    USDC->>PaymentEscrow: amount transferred
    JobMarketplace->>SDK: jobId
    
    Host->>JobMarketplace: claimJob(jobId)
    JobMarketplace->>Host: job assigned
    
    Host->>Host: processJob()
    Host->>JobMarketplace: completeJob(jobId, result)
    
    JobMarketplace->>PaymentEscrow: releasePayment(jobId)
    PaymentEscrow->>Host: 90% of payment
    PaymentEscrow->>Treasury: 10% protocol fee
    
    SDK->>Client: jobCompleted(result)
```

## Contract Interaction Flow

### Smart Contract Architecture (Base Sepolia)

```mermaid
graph LR
    subgraph Contracts[Base Sepolia Contracts]
        JM[JobMarketplace<br/>0x6C4283A2aAee...]
        PE[PaymentEscrow]
        USDC[USDC Token]
        FAB[FAB Token<br/>Governance Only]
    end
    
    subgraph Participants
        CLIENT[Client]
        HOST[Host Node]
        TREASURY[Treasury]
    end
    
    CLIENT -->|Approve USDC| USDC
    CLIENT -->|Post Job with USDC/ETH| JM
    JM -->|Transfer USDC/ETH| PE
    HOST -->|Claim Job| JM
    HOST -->|Complete Job| JM
    PE -->|90% Payment| HOST
    PE -->|10% Fee| TREASURY
    CLIENT -->|Stake FAB| FAB
    HOST -->|Stake FAB| FAB
```

### Payment Flow (USDC/ETH)

1. **Approval** (USDC only): Client approves JobMarketplace to spend USDC
2. **Escrow**: Payment automatically transferred to PaymentEscrow on job posting
3. **Lock**: Funds locked when host claims the job
4. **Distribution**: On completion:
   - 90% released to host
   - 10% sent to treasury as protocol fee
5. **Refund**: Client can reclaim funds if job expires unclaimed or fails

**Important**: FAB tokens are NOT used for job payments. They are only for:
- Governance voting
- Node staking requirements
- Platform incentives

## Streaming Protocol

The SDK implements a custom streaming protocol for real-time token delivery:

### Protocol Specification

```typescript
// Stream initialization
interface StreamInit {
  version: "1.0.0";
  jobId: string;
  nodeId: string;
  checkpoint?: number;
  compression?: "none" | "gzip";
}

// Token message
interface TokenMessage {
  type: "token";
  index: number;
  content: string;
  timestamp: number;
  metadata?: {
    modelId: string;
    temperature: number;
    cumulativeLogProb?: number;
  };
}

// Control messages
interface ControlMessage {
  type: "pause" | "resume" | "checkpoint" | "error" | "end";
  data: any;
}
```

### Stream State Machine

```mermaid
stateDiagram-v2
    [*] --> Initializing: Create Stream
    Initializing --> Active: Connection Established
    Active --> Paused: Pause Requested
    Paused --> Active: Resume Requested
    Active --> Error: Error Occurred
    Error --> Active: Retry Successful
    Active --> Closing: Close Requested
    Closing --> [*]: Stream Closed
    Error --> [*]: Max Retries Exceeded
```

### Buffering and Flow Control

```typescript
class StreamBuffer {
  private buffer: CircularBuffer<TokenMessage>;
  private highWaterMark: number = 1000;
  private lowWaterMark: number = 100;
  
  async handleIncoming(token: TokenMessage) {
    if (this.buffer.size() >= this.highWaterMark) {
      await this.pause();
    }
    
    this.buffer.push(token);
    this.emit('token', token);
    
    if (this.isPaused && this.buffer.size() <= this.lowWaterMark) {
      await this.resume();
    }
  }
}
```

## Security Architecture

### 1. Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant SDK
    participant Node
    
    Client->>SDK: Connect with wallet
    SDK->>SDK: Generate session keypair
    SDK->>Node: Request challenge
    Node->>SDK: Challenge nonce
    SDK->>SDK: Sign challenge with wallet
    SDK->>Node: Submit signature
    Node->>Node: Verify signature
    Node->>SDK: Session established
```

### 2. Encryption Layers

- **Transport**: TLS/Noise protocol for P2P connections
- **Message**: End-to-end encryption for sensitive data
- **Storage**: Client-side encryption before IPFS storage

### 3. Access Control

```typescript
// Role-based permissions
enum Role {
  CLIENT = "client",
  NODE = "node", 
  ARBITRATOR = "arbitrator"
}

// Permission checks
function canSubmitJob(address: string): boolean {
  return hasRole(address, Role.CLIENT) && 
         hasMinimumBalance(address) &&
         !isBlacklisted(address);
}
```

## Performance Considerations

### 1. Connection Pooling

```typescript
class ConnectionPool {
  private connections: Map<string, Connection>;
  private maxConnections: number = 50;
  private idleTimeout: number = 300000; // 5 minutes
  
  async getConnection(nodeId: string): Promise<Connection> {
    // Reuse existing connection
    if (this.connections.has(nodeId)) {
      return this.connections.get(nodeId);
    }
    
    // Create new connection
    if (this.connections.size >= this.maxConnections) {
      await this.evictIdleConnections();
    }
    
    const conn = await this.createConnection(nodeId);
    this.connections.set(nodeId, conn);
    return conn;
  }
}
```

### 2. Caching Strategy

```typescript
class NodeCache {
  private cache: LRUCache<string, CachedNode>;
  private ttl: number = 300000; // 5 minutes
  
  async getNodes(modelId: string): Promise<DiscoveredNode[]> {
    const cacheKey = `nodes:${modelId}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.ttl) {
        return cached.nodes;
      }
    }
    
    // Fetch fresh data
    const nodes = await this.p2p.discoverNodes({ modelId });
    this.cache.set(cacheKey, { nodes, timestamp: Date.now() });
    return nodes;
  }
}
```

### 3. Optimistic Updates

```typescript
// Update UI immediately, verify later
async submitJobOptimistic(params: JobParams) {
  // 1. Generate temporary ID
  const tempId = generateTempId();
  
  // 2. Update UI immediately
  this.emit('job:submitted', { jobId: tempId, status: 'pending' });
  
  // 3. Submit actual job
  try {
    const realId = await this.submitJob(params);
    this.emit('job:confirmed', { tempId, realId });
  } catch (error) {
    this.emit('job:failed', { tempId, error });
  }
}
```

### 4. Parallel Operations

```typescript
// Execute operations in parallel when possible
async submitMultipleJobs(jobs: JobParams[]) {
  // Discover nodes for all models in parallel
  const modelIds = [...new Set(jobs.map(j => j.modelId))];
  const nodesByModel = await Promise.all(
    modelIds.map(async modelId => ({
      modelId,
      nodes: await this.discoverNodes({ modelId })
    }))
  );
  
  // Submit jobs in parallel
  const results = await Promise.allSettled(
    jobs.map(job => this.submitJobWithNegotiation(job))
  );
  
  return results;
}
```

## Design Decisions

### Why libp2p?

- **Proven**: Battle-tested in IPFS and other projects
- **Modular**: Pick only needed components
- **Cross-platform**: Works in browser and Node.js
- **NAT traversal**: Built-in hole punching
- **Protocol agnostic**: Supports multiple transports

### Why Base Sepolia?

- **Low fees**: Fraction of mainnet costs, ideal for micropayments
- **Fast finality**: Quick transaction confirmation (2-3 seconds)
- **USDC native support**: Direct USDC integration on Base
- **EVM compatible**: All Ethereum tools work seamlessly
- **Coinbase backing**: Strong institutional support
- **Growing ecosystem**: Rapidly expanding DeFi and developer community

### Why EventEmitter Pattern?

- **Familiar**: Standard Node.js pattern
- **Flexible**: Easy to extend
- **Decoupled**: Loose coupling between components
- **Async-friendly**: Natural fit for async operations
- **Debuggable**: Easy to trace event flow

### Current Implementation Status

✅ **Completed**:
- USDC payment integration
- ETH payment support
- JobMarketplace with postJobWithToken
- PaymentEscrow with automatic distribution
- Base Sepolia deployment

🚧 **In Progress**:
- P2P node discovery
- Direct node communication
- WebSocket streaming

📋 **Planned**:
1. **Multi-chain Support**: Deploy to multiple L2s
2. **Advanced Routing**: ML-based node selection
3. **Compression**: Reduce bandwidth usage
4. **Caching Layer**: Edge caching for popular queries
5. **Federation**: Cross-network job routing