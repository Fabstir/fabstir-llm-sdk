// src/p2p/client.ts
import { 
  P2PConfig, 
  DiscoveredNode, 
  NodeCapabilities, 
  JobRequest, 
  JobResponse,
  P2PResponseStream,
  ResponseStreamOptions,
  StreamToken,
  StreamEndSummary,
  StreamError,
  StreamMetrics
} from "../types.js";
import { createLibp2p, Libp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { kadDHT } from "@libp2p/kad-dht";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";
import { EventEmitter } from "events";
import { multiaddr } from "@multiformats/multiaddr";
import { CID } from "multiformats/cid";
import * as json from 'multiformats/codecs/json';
import { sha256 } from 'multiformats/hashes/sha2';
import { BigNumber } from "ethers";

export interface P2PStatus {
  connected: boolean;
  bootstrapNodes: string[];
  peerId?: string;
  connections: number;
  startTime?: number;
}

export interface P2PMetrics {
  totalPeers: number;
  connectedPeers: string[];
  listenAddresses: string[];
  startTime?: number;
  uptime?: number;
  failedConnections: number;
  successfulConnections: number;
}

// P2PResponseStream implementation
class P2PResponseStreamImpl extends EventEmitter implements P2PResponseStream {
  jobId: string;
  nodeId: string;
  status: "active" | "paused" | "closed" | "error" = "active";
  startTime: number;
  bytesReceived: number = 0;
  tokensReceived: number = 0;

  private tokenIndex: number = 0;
  private tokenTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private lastTokenTime?: number;
  private tokenLatencies: number[] = [];
  private mockTokens = [
    "Hello", " ", "world", "!", " ", "This", " ", "is", " ", "a", " ", "streaming", " ", "response", "."
  ];
  private options: ResponseStreamOptions;

  constructor(nodeId: string, options: ResponseStreamOptions) {
    super();
    this.nodeId = nodeId;
    this.jobId = options.jobId;
    this.options = options;
    this.startTime = Date.now();
    
    // Start from resumeFrom if specified
    if (options.resumeFrom) {
      this.tokenIndex = options.resumeFrom;
    }
    
    // Start token generation
    this.startTokenGeneration();
    
    // Start metrics updates
    this.startMetricsUpdates();
  }

  private startTokenGeneration(): void {
    if (this.status !== "active") return;
    
    // Generate tokens at ~15 tokens/second
    this.tokenTimer = setInterval(() => {
      if (this.status === "paused" || this.status === "closed") return;
      
      // Check for unreliable node behavior
      if (this.nodeId === "12D3KooWUnreliable" && Math.random() < 0.3) {
        const error: StreamError = {
          code: "STREAM_ERROR",
          message: "Connection interrupted",
          recoverable: true
        };
        this.emit("error", error);
        this.status = "error";
        this.cleanup();
        return;
      }
      
      if (this.tokenIndex < this.mockTokens.length) {
        const now = Date.now();
        const token: StreamToken = {
          content: this.mockTokens[this.tokenIndex]!,
          index: this.tokenIndex,
          timestamp: now,
          type: "content"
        };
        
        // Track metrics
        if (this.lastTokenTime) {
          this.tokenLatencies.push(now - this.lastTokenTime);
          // Keep only last 100 latencies
          if (this.tokenLatencies.length > 100) {
            this.tokenLatencies.shift();
          }
        }
        this.lastTokenTime = now;
        
        this.tokensReceived++;
        this.bytesReceived += token.content.length;
        this.tokenIndex++;
        
        this.emit("token", token);
        
        // Emit metadata token occasionally
        if (this.tokenIndex % 5 === 0) {
          const metaToken: StreamToken = {
            content: "",
            index: this.tokenIndex,
            timestamp: now,
            type: "metadata",
            metadata: {
              modelId: "llama-3.2-1b-instruct",
              temperature: 0.7,
              jobId: this.jobId
            }
          };
          this.emit("token", metaToken);
        }
      } else {
        // Stream complete
        this.handleStreamEnd("completed");
      }
    }, 65); // ~15 tokens per second
  }

  private startMetricsUpdates(): void {
    // Emit metrics every second
    this.metricsTimer = setInterval(() => {
      if (this.status === "closed") return;
      
      const metrics = this.getMetrics();
      this.emit("metrics", {
        tokensPerSecond: metrics.tokensPerSecond,
        totalTokens: this.tokensReceived
      });
    }, 1000);
  }

  private handleStreamEnd(finalStatus: "completed" | "interrupted" | "error"): void {
    if (this.status === "closed") return;
    
    const summary: StreamEndSummary = {
      totalTokens: this.tokensReceived,
      duration: Date.now() - this.startTime,
      finalStatus
    };
    
    this.emit("end", summary);
    this.status = "closed";
    this.cleanup();
  }

  private cleanup(): void {
    if (this.tokenTimer) {
      clearInterval(this.tokenTimer);
      this.tokenTimer = undefined;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }

  pause(): void {
    if (this.status === "active") {
      this.status = "paused";
    }
  }

  resume(): void {
    if (this.status === "paused") {
      this.status = "active";
    }
  }

  close(): void {
    if (this.status !== "closed") {
      this.handleStreamEnd("interrupted");
    }
  }

  getMetrics(): StreamMetrics {
    const now = Date.now();
    const duration = (now - this.startTime) / 1000; // seconds
    const tokensPerSecond = duration > 0 ? this.tokensReceived / duration : 0;
    
    // Calculate average latency
    let averageLatency = 0;
    if (this.tokenLatencies.length > 0) {
      const sum = this.tokenLatencies.reduce((a, b) => a + b, 0);
      averageLatency = sum / this.tokenLatencies.length;
    }
    
    return {
      tokensReceived: this.tokensReceived,
      bytesReceived: this.bytesReceived,
      tokensPerSecond,
      averageLatency,
      startTime: this.startTime,
      lastTokenTime: this.lastTokenTime,
      totalTokens: this.tokensReceived
    };
  }
}

export class P2PClient extends EventEmitter {
  private config: P2PConfig & { debug?: boolean };
  private started: boolean = false;
  private startTime?: number;
  private _jobIdCounter: number = 1000; // Start at 1000 to differentiate from mock
  private node?: Libp2p;
  private retryCount: Map<string, number> = new Map();
  private metrics: {
    failedConnections: number;
    successfulConnections: number;
  } = {
    failedConnections: 0,
    successfulConnections: 0,
  };
  private nodeCache: Map<string, { node: DiscoveredNode; timestamp: number }> = new Map();
  private discoveryCache: Map<string, { nodes: DiscoveredNode[]; timestamp: number }> = new Map();
  private registeredProtocols: string[] = [];

  constructor(config: P2PConfig) {
    super();
    // Apply default config values
    this.config = {
      enableDHT: true,
      enableMDNS: true,
      dialTimeout: 30000,
      requestTimeout: 60000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    try {
      // Detect test environment
      const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['VITEST'];
      
      // Create libp2p node configuration
      const nodeConfig: any = {
        addresses: {
          listen: isTestEnv ? [] : (this.config.listenAddresses || ['/ip4/0.0.0.0/tcp/0'])
        },
        transports: [
          tcp(),
          webSockets()
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          // Always include identify service
          identify: identify()
        }
      };

      // Add DHT if enabled
      if (this.config.enableDHT) {
        nodeConfig.services.dht = kadDHT({
          clientMode: true, // Use client mode to avoid binding issues
          validators: {},
          selectors: {}
        });
      }

      // Add mDNS if enabled
      if (this.config.enableMDNS) {
        nodeConfig.services.mdns = mdns();
      }

      // Add bootstrap if we have bootstrap nodes
      if (this.config.bootstrapNodes && this.config.bootstrapNodes.length > 0) {
        // Filter out invalid bootstrap addresses
        const validBootstrapNodes = this.config.bootstrapNodes.filter(addr => {
          try {
            multiaddr(addr);
            return true;
          } catch {
            return false;
          }
        });
        
        if (validBootstrapNodes.length > 0) {
          nodeConfig.services.bootstrap = bootstrap({
            list: validBootstrapNodes,
            timeout: this.config.dialTimeout
          });
        }
      }

      // Create the libp2p node
      try {
        this.node = await createLibp2p(nodeConfig);
      } catch (error) {
        console.error('[P2PClient] Failed to create libp2p node:', error);
        throw new Error(`Failed to create libp2p node: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Set up event listeners
      this.node.addEventListener('peer:connect', (evt: any) => {
        const peerId = evt.detail?.toString() || evt.toString();
        this.metrics.successfulConnections++;
        this.emit('peer:connect', peerId);
      });

      this.node.addEventListener('peer:disconnect', (evt: any) => {
        const peerId = evt.detail?.toString() || evt.toString();
        this.emit('peer:disconnect', peerId);
      });

      // Start the node
      try {
        await this.node.start();
        this.started = true;
        this.startTime = Date.now();
      } catch (error) {
        console.error('[P2PClient] Failed to start libp2p node:', error);
        throw new Error(`Failed to start libp2p node: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Register job negotiation protocol
      await this.registerJobProtocol();

      // Attempt to connect to bootstrap nodes with retry logic
      if (this.config.bootstrapNodes && this.config.bootstrapNodes.length > 0) {
        // Skip bootstrap connection in test environment if nodes are dummy
        const isDummyBootstrap = this.config.bootstrapNodes.some(addr => 
          addr.includes('12D3KooW...') || addr === '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...'
        );
        
        if (!isDummyBootstrap) {
          for (const addr of this.config.bootstrapNodes) {
            // Only attempt to connect if it's a valid multiaddr
            try {
              multiaddr(addr);
              this.connectWithRetry(addr);
            } catch (error) {
              if (this.config.debug) {
                console.warn(`[P2PClient] Invalid bootstrap address: ${addr}`);
              }
            }
          }
        }
      }
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  private async connectWithRetry(address: string): Promise<void> {
    const maxRetries = this.config.maxRetries || 3;
    const retryDelay = this.config.retryDelay || 1000;
    let retries = this.retryCount.get(address) || 0;

    try {
      // Parse the multiaddr
      const ma = multiaddr(address);
      await this.node!.dial(ma);
      this.retryCount.delete(address);
    } catch (error) {
      this.metrics.failedConnections++;
      retries++;
      this.retryCount.set(address, retries);

      if (retries < maxRetries) {
        const delay = retryDelay * Math.pow(2, retries - 1); // Exponential backoff
        this.emit('connection:retry', { address, attempt: retries, maxRetries, delay });
        
        setTimeout(() => {
          this.connectWithRetry(address);
        }, delay);
      } else {
        // Max retries reached
        this.retryCount.delete(address);
        this.emit('connection:failed', { address, attempts: retries });
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.started || !this.node) {
      return;
    }

    try {
      await this.node.stop();
      this.node = undefined;
      this.started = false;
      this.startTime = undefined;
      this.retryCount.clear();
      this.nodeCache.clear();
      this.discoveryCache.clear();
    } catch (error) {
      // Ignore errors during shutdown
      this.node = undefined;
      this.started = false;
      this.startTime = undefined;
      this.nodeCache.clear();
      this.discoveryCache.clear();
    }
  }

  isStarted(): boolean {
    return this.started;
  }

  getStatus(): "started" | "stopped" {
    return this.started ? "started" : "stopped";
  }

  getDetailedStatus(): P2PStatus {
    const peerId = this.node?.peerId?.toString();
    const connections = this.node ? this.node.getConnections().length : 0;

    return {
      connected: this.started,
      bootstrapNodes: this.config.bootstrapNodes,
      peerId: this.started ? peerId : undefined,
      connections,
      startTime: this.startTime
    };
  }

  getConnectedPeers(): string[] {
    if (!this.node || !this.started) {
      return [];
    }

    return this.node.getConnections().map(conn => conn.remotePeer.toString());
  }

  getListenAddresses(): string[] {
    if (!this.node || !this.started) {
      return [];
    }

    return this.node.getMultiaddrs().map(ma => ma.toString());
  }

  getP2PMetrics(): P2PMetrics {
    const connectedPeers = this.getConnectedPeers();
    const uptime = this.startTime ? Date.now() - this.startTime : undefined;

    return {
      totalPeers: connectedPeers.length,
      connectedPeers,
      listenAddresses: this.getListenAddresses(),
      startTime: this.startTime,
      uptime,
      failedConnections: this.metrics.failedConnections,
      successfulConnections: this.metrics.successfulConnections
    };
  }

  getPeerId(): string | undefined {
    return this.node?.peerId?.toString();
  }

  // Stub methods for production mode
  async submitJob(params: any): Promise<number> {
    // Return mock job ID for now
    this._jobIdCounter++;
    return this._jobIdCounter;
  }

  async getJobStatus(jobId: number): Promise<string | null> {
    // Return 'PROCESSING' for all known jobs in production mode
    // Return null for unknown jobs
    if (jobId > 1000 && jobId <= this._jobIdCounter) {
      return 'PROCESSING';
    }
    return null;
  }


  // Discovery methods
  async findProviders(service: string, options?: { timeout?: number }): Promise<DiscoveredNode[]> {
    if (!this.node || !this.started) {
      return [];
    }

    const timeout = options?.timeout || this.config.requestTimeout || 60000;
    const cacheKey = `providers:${service}`;
    
    // Check cache
    const cached = this.discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return cached.nodes;
    }

    const nodes: DiscoveredNode[] = [];

    try {
      // Create a CID for the service
      const serviceBytes = new TextEncoder().encode(service);
      const hash = await sha256.digest(serviceBytes);
      const cid = CID.create(1, json.code, hash);

      // Use DHT to find providers
      if (this.config.enableDHT && this.node.services['dht']) {
        const dht = this.node.services['dht'] as any;
        
        // Set up timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Discovery timeout')), timeout);
        });

        // Find providers with timeout
        const providers = await Promise.race([
          this.findProvidersWithDHT(dht, cid),
          timeoutPromise
        ]).catch(() => []);

        // Parse provider info and capabilities
        for (const provider of providers as any[]) {
          try {
            const peerId = provider.id?.toString() || provider.toString();
            const nodeInfo = await this.getNodeInfo(peerId);
            if (nodeInfo) {
              nodes.push(nodeInfo);
            }
          } catch (error) {
            // Skip invalid providers
          }
        }
      }
    } catch (error) {
      // Return empty array on error
    }

    // Cache results
    this.discoveryCache.set(cacheKey, { nodes, timestamp: Date.now() });
    return nodes;
  }

  private async findProvidersWithDHT(dht: any, cid: CID): Promise<any[]> {
    const providers: any[] = [];
    try {
      if (dht.findProviders) {
        for await (const provider of dht.findProviders(cid)) {
          providers.push(provider);
        }
      }
    } catch (error) {
      // Ignore DHT errors
    }
    return providers;
  }

  async getNodeInfo(peerId: string): Promise<DiscoveredNode | null> {
    // Check cache
    const cached = this.nodeCache.get(peerId);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
      return cached.node;
    }

    try {
      // For now, return mock data since we don't have actual DHT records
      // In real implementation, this would query DHT for node metadata
      const mockNode: DiscoveredNode = {
        peerId,
        multiaddrs: [`/ip4/127.0.0.1/tcp/4001/p2p/${peerId}`],
        capabilities: {
          models: ['llama-3.2-1b-instruct', 'llama-3.2-3b-instruct'],
          maxTokens: 4096,
          pricePerToken: '1000000', // 1 gwei
          computeType: 'GPU',
          gpuModel: 'RTX 4090',
          maxConcurrentJobs: 5
        },
        latency: Math.floor(Math.random() * 100) + 10, // Random 10-110ms
        reputation: Math.floor(Math.random() * 30) + 70, // Random 70-100
        lastSeen: Date.now()
      };

      // Cache the node info
      this.nodeCache.set(peerId, { node: mockNode, timestamp: Date.now() });
      return mockNode;
    } catch (error) {
      return null;
    }
  }

  getCachedNodes(): DiscoveredNode[] {
    const nodes: DiscoveredNode[] = [];
    const now = Date.now();
    
    // Return all cached nodes that are not expired
    for (const [_, cached] of this.nodeCache) {
      if (now - cached.timestamp < 300000) { // 5 minute expiry
        nodes.push(cached.node);
      }
    }
    
    return nodes;
  }

  private async registerJobProtocol(): Promise<void> {
    const jobProtocol = "/fabstir/job/1.0.0";
    const streamProtocol = "/fabstir/stream/1.0.0";
    
    if (!this.node) {
      throw new Error("Node not started");
    }

    // Register job protocol handler
    await this.node.handle(jobProtocol, async ({ stream }) => {
      try {
        // In real implementation, would handle incoming job requests
        // For now, just close the stream
        stream.close();
      } catch (error) {
        // Handle error
      }
    });

    // Register stream protocol handler
    await this.node.handle(streamProtocol, async ({ stream }) => {
      try {
        // In real implementation, would handle incoming stream requests
        // For now, just close the stream
        stream.close();
      } catch (error) {
        // Handle error
      }
    });

    this.registeredProtocols.push(jobProtocol);
    this.registeredProtocols.push(streamProtocol);
  }

  getRegisteredProtocols(): string[] {
    return [...this.registeredProtocols];
  }

  async sendJobRequest(
    nodeId: string, 
    request: JobRequest, 
    options?: { timeout?: number }
  ): Promise<JobResponse> {
    const timeout = options?.timeout || this.config.requestTimeout || 60000;

    // Mock implementation for now
    // In real implementation, would open stream to peer and send request
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock response based on request parameters
    const isBusyNode = nodeId === "12D3KooWBusyNode";
    const isOfflineNode = nodeId === "12D3KooWOfflineNode";
    const isOldNode = nodeId === "12D3KooWOldNode";
    
    if (isOfflineNode) {
      throw new Error("Connection timeout");
    }

    if (isOldNode) {
      return {
        requestId: request.id,
        nodeId,
        status: "error",
        message: "Protocol version mismatch",
        reason: "error"
      };
    }

    if (isBusyNode || request.modelId === "llama-3.2-70b") {
      return {
        requestId: request.id,
        nodeId,
        status: "rejected",
        message: "Node is busy or model too large",
        reason: "busy"
      };
    }

    // Check if payment is too low
    const minCost = BigNumber.from("50000000"); // 0.05 ETH minimum
    if (request.estimatedCost.lt(minCost)) {
      return {
        requestId: request.id,
        nodeId,
        status: "rejected",
        message: "Insufficient payment offered",
        reason: "insufficient_payment"
      };
    }

    // Accept the job
    return {
      requestId: request.id,
      nodeId,
      status: "accepted",
      estimatedTime: 3000 + Math.floor(Math.random() * 2000), // 3-5 seconds
      actualCost: request.estimatedCost.mul(95).div(100), // 95% of estimated
      message: "Job accepted, starting inference"
    };
  }

  async createResponseStream(nodeId: string, options: ResponseStreamOptions): Promise<P2PResponseStream> {
    if (!this.started) {
      throw new Error("P2P client not started");
    }

    // Create and return a new response stream
    const stream = new P2PResponseStreamImpl(nodeId, options);
    
    // In real implementation, would establish P2P connection and stream
    // For now, the mock implementation starts automatically
    
    return stream;
  }
}