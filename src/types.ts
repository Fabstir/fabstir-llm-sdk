// src/types.ts
import { BigNumber } from "ethers";

// Job related types
export interface JobRequest {
  prompt: string;
  modelId: string;
  maxTokens: number;
  temperature?: number;
  paymentToken?: string;
  maxPrice?: BigNumber;
  metadata?: Record<string, any>;
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

export interface StreamToken {
  content: string;
  timestamp: number;
  index: number;
  metadata?: {
    modelId: string;
    temperature: number;
    jobId: number;
  };
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
}
