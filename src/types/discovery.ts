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
  source?: string;
  timestamp?: number;
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

// Host Selection types
export type SelectionStrategy = 'price' | 'latency' | 'capability' | 'composite' | 'round-robin';

export interface SelectionCriteria {
  strategy: SelectionStrategy;
  maxPrice?: number;
  maxLatency?: number;
  requiredModel?: string;
  requiredCapabilities?: string[];
  preferredCapabilities?: string[];
  preferredRegion?: string;
}

export interface Weights {
  price: number;
  latency: number;
  reliability: number;
}

export interface Requirements {
  models?: string[];
  capabilities?: string[];
  maxPrice?: number;
  maxLatency?: number;
  region?: string;
}

export interface HostScore {
  host: Host;
  score: number;
  breakdown?: {
    priceScore?: number;
    latencyScore?: number;
    reliabilityScore?: number;
  };
}

export interface SelectionStats {
  totalSelections: number;
  successRate: number;
  hostSelectionCounts: Record<string, number>;
  hostReliabilityScores: Record<string, number>;
  averageSessionDuration?: number;
}

export interface HostWithReliability extends Host {
  reliability?: number;
}

// Unified Discovery types
export interface DiscoverySourceStats {
  attempts: number;
  successes: number;
  failures: number;
  averageTime: number;
  lastSuccess?: number;
  lastFailure?: number;
}

export interface DiscoveryStats {
  totalDiscoveries: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  sourceStats: Record<string, DiscoverySourceStats>;
}

export interface UnifiedDiscoveryOptions {
  forceRefresh?: boolean;
  maxPrice?: number;
  model?: string;
  region?: string;
  minLatency?: number;
  maxLatency?: number;
}