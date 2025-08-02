// src/p2p/client.ts
import { P2PConfig } from "../types.js";
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
      // Create libp2p node configuration
      const nodeConfig: any = {
        addresses: {
          listen: this.config.listenAddresses || ['/ip4/0.0.0.0/tcp/0']
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
          clientMode: false,
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
      this.node = await createLibp2p(nodeConfig);

      // Set up event listeners
      this.node.addEventListener('peer:connect', (evt) => {
        const peerId = evt.detail.toString();
        this.metrics.successfulConnections++;
        this.emit('peer:connect', peerId);
      });

      this.node.addEventListener('peer:disconnect', (evt) => {
        const peerId = evt.detail.toString();
        this.emit('peer:disconnect', peerId);
      });

      // Start the node
      await this.node.start();
      this.started = true;
      this.startTime = Date.now();

      // Attempt to connect to bootstrap nodes with retry logic
      if (this.config.bootstrapNodes && this.config.bootstrapNodes.length > 0) {
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
    } catch (error) {
      // Ignore errors during shutdown
      this.node = undefined;
      this.started = false;
      this.startTime = undefined;
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

  createResponseStream(jobId: number): AsyncIterableIterator<any> {
    // Return mock stream for production mode
    const mockTokens = ["This ", "is ", "a ", "production ", "mode ", "response."];
    let index = 0;
    
    return {
      async next() {
        if (index < mockTokens.length) {
          const token = {
            content: mockTokens[index],
            index: index,
            timestamp: Date.now()
          };
          index++;
          return { done: false, value: token };
        }
        return { done: true, value: undefined };
      },
      
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
}