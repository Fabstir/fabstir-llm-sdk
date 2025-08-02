// src/types.ts
import { BigNumber } from "ethers";

// Job related types
export interface JobSubmissionRequest {
  prompt: string;
  modelId: string;
  maxTokens: number;
  temperature?: number;
  paymentToken?: string;
  maxPrice?: BigNumber;
  metadata?: Record<string, any>;
  stream?: boolean;
}

export enum JobStatus {
  POSTED = "POSTED",
  CLAIMED = "CLAIMED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  DISPUTED = "DISPUTED",
}

export interface JobDetails {
  id: number;
  client: string;
  host?: string;
  prompt: string;
  modelId: string;
  status: JobStatus;
  maxTokens: number;
  temperature: number;
  paymentToken: string;
  maxPrice: BigNumber;
  timestamp: number;
  completionTime?: number;
  resultHash?: string;
}

export interface JobResult {
  response: string;
  tokensUsed: number;
  completionTime: number;
  modelId: string;
  inferenceTime: number;
  proofHash?: string;
}

export interface JobEvent {
  type: "status_change" | "claimed" | "processing" | "completed" | "failed";
  jobId: number;
  timestamp: number;
  data: any;
}

// Model related types
export interface Model {
  id: string;
  name: string;
  description?: string;
  parameters: number;
  contextLength: number;
  capabilities: string[];
  pricePerToken: BigNumber;
  minPrice?: BigNumber;
  available: boolean;
}

export interface ModelFilter {
  maxParameters?: number;
  minParameters?: number;
  maxPrice?: BigNumber;
  capabilities?: string[];
  minContextLength?: number;
}

export interface ModelAvailability {
  modelId: string;
  totalNodes: number;
  onlineNodes: number;
  averageLatency: number;
  lowestPrice: BigNumber;
  highestPrice: BigNumber;
}

// Node related types
export interface NodeInfo {
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

export interface NodeSelectionCriteria {
  modelId: string;
  maxLatency?: number;
  minReputation?: number;
  maxPrice?: number;
  preferredNodes?: string[];
  excludeNodes?: string[];
}

// Payment related types
export enum PaymentStatus {
  PENDING = "PENDING",
  ESCROWED = "ESCROWED",
  RELEASED = "RELEASED",
  REFUNDED = "REFUNDED",
  DISPUTED = "DISPUTED",
}

export interface PaymentDetails {
  jobId: number;
  amount: BigNumber;
  token: string;
  status: PaymentStatus;
  payer: string;
  recipient: string;
  escrowedAt: number;
  releasedAt?: number;
}

export interface CostEstimate {
  estimatedCost: BigNumber;
  estimatedTokens: number;
  pricePerToken: BigNumber;
  modelId: string;
  includesBuffer: boolean;
}

export interface ActualCost {
  totalCost: BigNumber;
  tokensUsed: number;
  pricePerToken: BigNumber;
  breakdown: {
    hostPayment: BigNumber;
    treasuryFee: BigNumber;
    stakerReward: BigNumber;
  };
}

// Streaming related types
export interface StreamOptions {
  bufferSize?: number;
  flushInterval?: number;
  includeMetadata?: boolean;
  resumeFrom?: number;
  signal?: AbortSignal;
}


// Result metadata
export interface ResultMetadata {
  model: string;
  temperature: number;
  inferenceTime: number;
  tokensPerSecond: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  nodeAddress: string;
  timestamp: number;
}

// P2P Configuration
export interface P2PConfig {
  bootstrapNodes: string[];        // Required, must have at least one
  enableDHT?: boolean;            // Optional, defaults to true
  enableMDNS?: boolean;           // Optional, defaults to true  
  listenAddresses?: string[];     // Optional, for specifying listen addresses
  dialTimeout?: number;           // Optional, defaults to 30000 (30s)
  requestTimeout?: number;        // Optional, defaults to 60000 (60s)
  maxRetries?: number;            // Optional, defaults to 3
  retryDelay?: number;            // Optional, defaults to 1000 (1s)
}

// Node discovery types
export interface NodeCapabilities {
  models: string[]; // Supported model IDs
  maxTokens: number; // Maximum tokens per request
  pricePerToken: string; // Price in wei
  computeType?: string; // "CPU" | "GPU" | "TPU"
  gpuModel?: string; // e.g., "RTX 4090"
  maxConcurrentJobs?: number; // Parallel job capacity
}

export interface DiscoveredNode {
  peerId: string;
  multiaddrs: string[];
  capabilities: NodeCapabilities;
  latency?: number; // Measured latency in ms
  reputation?: number; // 0-100 score
  lastSeen: number; // Timestamp
}

export interface NodeDiscoveryOptions {
  modelId: string;
  maxLatency?: number;
  minReputation?: number;
  maxPrice?: string;
  preferredNodes?: string[];
  excludeNodes?: string[];
  forceRefresh?: boolean;
}

export interface DiscoveryConfig {
  cacheTTL?: number; // Cache time-to-live in ms
  maxNodes?: number; // Maximum nodes to return
  discoveryTimeout?: number; // Discovery timeout in ms
}

// Job negotiation types
export interface JobRequest {
  id: string;
  requester: string;
  modelId: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  estimatedCost: BigNumber;
  timestamp: number;
}

export interface JobResponse {
  requestId: string;
  nodeId: string;
  status: "accepted" | "rejected" | "error";
  estimatedTime?: number; // ms
  actualCost?: BigNumber;
  message?: string;
  reason?: "busy" | "insufficient_payment" | "unsupported_model" | "timeout" | "error";
}

export interface JobNegotiation {
  node: DiscoveredNode;
  request: JobRequest;
  response: JobResponse;
  timestamp: number;
  negotiatedPrice?: BigNumber;
  txHash?: string;
}

export interface NegotiationOptions {
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
}

// P2P Response Streaming types
export interface P2PResponseStream {
  jobId: string;
  nodeId: string;
  status: "active" | "paused" | "closed" | "error";
  startTime: number;
  bytesReceived: number;
  tokensReceived: number;

  on(event: "token", listener: (token: StreamToken) => void): void;
  on(event: "end", listener: (summary: StreamEndSummary) => void): void;
  on(event: "error", listener: (error: StreamError) => void): void;
  on(event: "metrics", listener: (metrics: StreamMetrics) => void): void;

  pause(): void;
  resume(): void;
  close(): void;
  getMetrics(): StreamMetrics;
}

export interface StreamToken {
  content: string;
  index: number;
  timestamp: number;
  type?: "content" | "metadata";
  metadata?: {
    modelId?: string;
    temperature?: number;
    jobId?: string;
  };
}

export interface StreamEndSummary {
  totalTokens: number;
  duration: number;
  finalStatus: "completed" | "interrupted" | "error";
  error?: string;
}

export interface StreamError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface StreamMetrics {
  tokensReceived: number;
  bytesReceived: number;
  tokensPerSecond: number;
  averageLatency: number;
  startTime: number;
  lastTokenTime?: number;
  totalTokens?: number;
}

export interface ResponseStreamOptions {
  jobId: string;
  requestId: string;
  resumeFrom?: number;
}

// P2P-Contract Bridge types
export interface JobMapping {
  p2pJobId: string;
  blockchainJobId: number;
  nodeId: string;
  txHash?: string;
  createdAt: number;
}

export interface ChainReorgEvent {
  removedBlocks: number[];
  jobsAffected: number[];
}

export interface P2PJobState {
  jobId: number;
  p2pState: string;
  blockchainState?: JobStatus;
  lastSync: number;
}

// Error Recovery types
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: Error, attemptNumber: number) => boolean;
  onRetry?: (error: Error, attemptNumber: number) => void;
  signal?: AbortSignal;
}

export interface NodeReliabilityRecord {
  nodeId: string;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  averageResponseTime: number;
  successRate: number;
  lastSuccess?: number;
  lastFailure?: number;
  reliability: number; // 0-100 score
}

export interface JobRecoveryInfo {
  jobId: number | string;
  nodeId: string;
  requestParams: any;
  lastCheckpoint: number;
  tokensProcessed: number;
  canResume: boolean;
  resultHash?: string;
}

export interface ErrorRecoveryReport {
  period: {
    start: number;
    end: number;
  };
  totalRetries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  blacklistedNodes: string[];
  nodeReliability: Record<string, NodeReliabilityRecord>;
  recommendations: string[];
}

export type FailoverStrategy = "automatic" | "manual" | "disabled";
