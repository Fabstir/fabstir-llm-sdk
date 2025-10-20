// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * P2P Types - Node.js specific types for P2P networking
 */

export interface P2PConfig {
  bootstrapNodes?: string[];
  listen?: string[];
  enableDHT?: boolean;
  enableMDNS?: boolean;
  maxConnections?: number;
  minConnections?: number;
}

export interface DiscoveredNode {
  id: string;
  addresses: string[];
  protocols: string[];
  capabilities?: NodeCapabilities;
  metadata?: Record<string, any>;
}

export interface NodeCapabilities {
  models: string[];
  maxTokens: number;
  pricePerToken: number;
  supportedFormats: string[];
}

export interface JobRequest {
  id: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface JobResponse {
  id: string;
  nodeId: string;
  content?: string;
  streamUrl?: string;
  error?: string;
}

export interface P2PResponseStream {
  jobId: string;
  nodeId: string;
  status: "active" | "paused" | "closed" | "error";
  startTime: number;
  bytesReceived: number;
  tokensReceived: number;
}

export interface ResponseStreamOptions {
  jobId: string;
  nodeUrl?: string;
  resumeFrom?: number;
  bufferSize?: number;
  enableCompression?: boolean;
}

export interface StreamToken {
  content: string;
  index: number;
  timestamp: number;
}

export interface StreamEndSummary {
  totalTokens: number;
  totalBytes: number;
  duration: number;
  averageLatency: number;
}

export interface StreamError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface StreamMetrics {
  bytesReceived: number;
  tokensReceived: number;
  averageLatency: number;
  throughput: number;
}