export interface Node {
  peerId: string;
  address?: string;
  capabilities?: string[];
  connections?: string[];
}

export interface PeerInfo extends Node {
  reputation?: ReputationScore;
  metrics?: ConnectionMetrics;
  lastSeen?: number;
}

export interface ReputationScore {
  score: number;
  successfulRequests?: number;
  failedRequests?: number;
}

export interface ConnectionMetrics {
  latency?: number;
  bandwidth?: number;
  packetLoss?: number;
  averageLatency?: number;
  quality?: 'excellent' | 'good' | 'fair' | 'poor';
}

export type DiscoveryStrategy = 'mdns' | 'dht' | 'bootstrap' | 'hybrid';

export interface DiscoveryOptions {
  timeout?: number;
  capabilities?: string[];
  cacheTTL?: number;
  maxNodes?: number;
}

export interface NetworkTopology {
  nodes: Node[];
  edges: Array<{ from: string; to: string }>;
}

export interface PreferredPeerOptions {
  priority?: number;
  reason?: string;
}

// HTTP Discovery Service types
export interface Host {
  id?: string;
  peerId?: string;
  url?: string;
  models?: string[];
  pricePerToken?: number;
  latency?: number;
  region?: string;
  capabilities?: string[];
}

export interface HostFilter {
  model?: string;
  maxPrice?: number;
  region?: string;
  sortBy?: 'latency' | 'price' | 'reliability';
  forceRefresh?: boolean;
}

export interface HostDetails extends Host {
  uptime?: number;
  totalRequests?: number;
  averageResponseTime?: number;
}

export interface DiscoveryClientOptions {
  cacheTTL?: number;
  maxRetries?: number;
  timeout?: number;
}