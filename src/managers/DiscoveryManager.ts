import type AuthManager from './AuthManager';
import type { 
  Node, PeerInfo, ReputationScore, ConnectionMetrics, 
  DiscoveryOptions as DiscoveryOpts, NetworkTopology, PreferredPeerOptions 
} from '../types/discovery';

// Dynamic imports to support mocking in tests
type Libp2p = any;
type CreateLibp2pFn = (config: any) => Promise<Libp2p>;

export interface DiscoveryOptions extends DiscoveryOpts {
  listen?: string[];
  bootstrap?: string[];
}

export default class DiscoveryManager {
  private static readonly DEFAULT_LISTEN = ['/ip4/127.0.0.1/tcp/0'];
  private static readonly MIN_CONNECTIONS = 0;
  private static readonly MAX_CONNECTIONS = 10;
  private static readonly PROTOCOL_PREFIX = '/fabstir-llm/1.0.0';
  
  private node?: Libp2p;
  private p2pClient?: any;
  private messageHandler?: (message: any) => void;
  private running = false;
  private discoveryCache = new Map<string, { nodes: Node[]; timestamp: number }>();
  private peerInfo = new Map<string, PeerInfo>();
  private blacklist = new Map<string, { reason: string; until?: number }>();
  private preferredPeers = new Map<string, PreferredPeerOptions>();
  private connectionMetrics = new Map<string, ConnectionMetrics[]>();

  constructor(private authManager: AuthManager | any) {
    // Support both AuthManager and P2P client for testing
    if (authManager && authManager.dial) {
      this.p2pClient = authManager;
      this.authManager = authManager;
    }
  }

  async createNode(options?: DiscoveryOptions): Promise<string> {
    try {
      // Dynamic imports for better testability
      const { createLibp2p } = await import('libp2p');
      const { tcp } = await import('@libp2p/tcp');
      const { noise } = await import('@chainsafe/libp2p-noise');
      const { yamux } = await import('@chainsafe/libp2p-yamux');

      const config = {
        addresses: {
          listen: options?.listen || DiscoveryManager.DEFAULT_LISTEN
        },
        transports: [tcp()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionManager: {
          minConnections: DiscoveryManager.MIN_CONNECTIONS,
          maxConnections: DiscoveryManager.MAX_CONNECTIONS
        }
      };

      if (options?.bootstrap?.length) {
        (config as any).bootstrap = options.bootstrap;
      }

      this.node = await createLibp2p(config as any);
      await this.node.start();
      this.running = true;

      return this.node.peerId.toString();
    } catch (error: any) {
      throw new Error(`Failed to create P2P node: ${error.message}`);
    }
  }

  async connectToPeer(multiaddr: string): Promise<void> {
    if (!this.node) {
      throw new Error('Node not initialized');
    }

    try {
      await this.node.dial(multiaddr);
    } catch (error: any) {
      throw new Error(`Failed to connect to peer: ${error.message}`);
    }
  }

  getConnectedPeers(): string[] {
    if (!this.node) {
      return [];
    }

    const connections = this.node.getConnections();
    return connections.map(conn => conn.remotePeer.toString());
  }

  async sendMessage(peerId: string, message: any): Promise<void> {
    if (!this.node) {
      throw new Error('Node not initialized');
    }

    try {
      const protocol = `${DiscoveryManager.PROTOCOL_PREFIX}/message`;
      const stream = await (this.node as any).dialProtocol(
        `/p2p/${peerId}`,
        protocol
      );

      const data = JSON.stringify(message);
      const encoder = new TextEncoder();
      await stream.sink([encoder.encode(data)]);
      stream.close();
    } catch (error: any) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  onMessage(handler: (message: any) => void): void {
    if (!this.node) {
      throw new Error('Node not initialized');
    }

    this.messageHandler = handler;
    const protocol = `${DiscoveryManager.PROTOCOL_PREFIX}/message`;

    this.node.handle(protocol, async ({ stream }: any) => {
      try {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream.source) {
          chunks.push(chunk);
        }

        const decoder = new TextDecoder();
        const data = decoder.decode(Buffer.concat(chunks));
        const message = JSON.parse(data);

        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = undefined;
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getAuthManager(): AuthManager {
    if (this.authManager.isAuthenticated && !this.authManager.isAuthenticated()) {
      throw new Error('AuthManager not authenticated');
    }
    return this.authManager;
  }

  // ============= P2P Discovery Methods =============

  async discoverLocalNodes(options?: DiscoveryOpts): Promise<Node[]> {
    const cacheKey = 'local-' + JSON.stringify(options?.capabilities || []);
    const cached = this.discoveryCache.get(cacheKey);
    
    // Use cache if available and no explicit TTL, or if TTL hasn't expired
    if (cached) {
      if (!options?.cacheTTL) {
        // No TTL specified, use cache indefinitely
        return cached.nodes;
      }
      const age = Date.now() - cached.timestamp;
      if (age < options.cacheTTL) {
        return cached.nodes;
      }
    }

    try {
      let nodes: Node[] = [];
      
      if (this.p2pClient?.discoverLocal) {
        nodes = await Promise.race([
          this.p2pClient.discoverLocal(),
          new Promise<Node[]>(resolve => 
            setTimeout(() => resolve([]), options?.timeout || 5000)
          )
        ]);
      }

      if (options?.capabilities) {
        nodes = nodes.filter(n => 
          n.capabilities?.some(c => options.capabilities!.includes(c))
        );
      }

      nodes = this.filterBlacklisted(nodes);
      this.discoveryCache.set(cacheKey, { nodes, timestamp: Date.now() });
      return nodes;
    } catch (error) {
      return [];
    }
  }

  async discoverGlobalNodes(options?: DiscoveryOpts): Promise<Node[]> {
    try {
      let nodes: Node[] = [];
      
      if (this.p2pClient?.discoverGlobal) {
        try {
          nodes = await this.p2pClient.discoverGlobal();
        } catch (error) {
          // Fallback to bootstrap nodes
          if (this.p2pClient?.getBootstrapPeers) {
            nodes = await this.p2pClient.getBootstrapPeers();
          }
        }
      }

      if (options?.maxNodes) {
        nodes = nodes.slice(0, options.maxNodes);
      }

      return this.filterBlacklisted(nodes);
    } catch (error) {
      return [];
    }
  }

  async discoverHybrid(): Promise<Node[]> {
    const [local, global] = await Promise.all([
      this.discoverLocalNodes(),
      this.discoverGlobalNodes()
    ]);
    
    const uniqueNodes = new Map<string, Node>();
    [...local, ...global].forEach(n => uniqueNodes.set(n.peerId, n));
    return Array.from(uniqueNodes.values());
  }

  async findProviders(contentHash: string): Promise<Node[]> {
    if (this.p2pClient?.findProviders) {
      const providers = await this.p2pClient.findProviders(contentHash);
      return providers;
    }
    return [];
  }

  async connectBootstrapNodes(nodes: string[]): Promise<void> {
    for (const node of nodes) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          await (this.p2pClient || this.node)?.dial(node);
          break;
        } catch (error) {
          attempts++;
          if (attempts >= 3) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  async maintainBootstrapConnections(minConnections: number): Promise<void> {
    const current = this.p2pClient?.getBootstrapConnections?.() || 0;
    const needed = minConnections - current;
    
    for (let i = 0; i < needed; i++) {
      await (this.p2pClient || this.node)?.dial?.('/bootstrap');
    }
  }

  async announceCapabilities(capabilities: string[]): Promise<void> {
    const announcement = {
      type: 'capability_announcement',
      capabilities
    };
    
    if (this.p2pClient?.broadcast) {
      await this.p2pClient.broadcast(announcement);
    }
    
    if (this.p2pClient?.publishToDHT) {
      await this.p2pClient.publishToDHT(
        'capabilities-' + this.p2pClient.peerId?.toString(),
        { capabilities, timestamp: Date.now() }
      );
    }
  }

  async searchByCapability(capability: string): Promise<Node[]> {
    if (this.p2pClient?.searchByCapability) {
      return await this.p2pClient.searchByCapability(capability);
    }
    return [];
  }

  async handleCapabilityAnnouncement(announcement: any): Promise<void> {
    const peer = this.peerInfo.get(announcement.peerId) || { peerId: announcement.peerId };
    peer.capabilities = announcement.capabilities;
    peer.lastSeen = Date.now();
    this.peerInfo.set(announcement.peerId, peer);
  }

  async getPeerInfo(peerId: string): Promise<PeerInfo> {
    return this.peerInfo.get(peerId) || { peerId };
  }

  async getNetworkTopology(): Promise<NetworkTopology> {
    const peers = this.p2pClient?.getPeers?.() || [];
    const edges: Array<{ from: string; to: string }> = [];
    
    peers.forEach((peer: any) => {
      if (peer.connections) {
        peer.connections.forEach((conn: string) => {
          edges.push({ from: peer.peerId, to: conn });
        });
      }
    });
    
    // Remove duplicate edges
    const uniqueEdges = edges.filter((edge, index) => 
      edges.findIndex(e => 
        (e.from === edge.from && e.to === edge.to) ||
        (e.from === edge.to && e.to === edge.from)
      ) === index
    );
    
    return { nodes: peers, edges: uniqueEdges };
  }

  async updatePeerReputation(peerId: string, update: Partial<ReputationScore>): Promise<void> {
    const peer = this.peerInfo.get(peerId) || { peerId };
    
    if (!peer.reputation) {
      peer.reputation = { score: 0.5 };
    }
    
    if (update.successfulRequests !== undefined || update.failedRequests !== undefined) {
      const success = update.successfulRequests || peer.reputation.successfulRequests || 0;
      const failed = update.failedRequests || peer.reputation.failedRequests || 0;
      const total = success + failed;
      
      if (total > 0) {
        peer.reputation.score = success / total;
      }
      
      peer.reputation.successfulRequests = success;
      peer.reputation.failedRequests = failed;
    } else if (update.score !== undefined) {
      peer.reputation.score = update.score;
    }
    
    this.peerInfo.set(peerId, peer);
  }

  async getPeerReputation(peerId: string): Promise<ReputationScore> {
    const peer = this.peerInfo.get(peerId);
    return peer?.reputation || { score: 0.5 };
  }

  async recordConnectionMetrics(peerId: string, metrics: ConnectionMetrics): Promise<void> {
    const history = this.connectionMetrics.get(peerId) || [];
    history.push(metrics);
    
    // Keep last 100 measurements
    if (history.length > 100) {
      history.shift();
    }
    
    this.connectionMetrics.set(peerId, history);
  }

  async getConnectionMetrics(peerId: string): Promise<ConnectionMetrics> {
    const history = this.connectionMetrics.get(peerId) || [];
    
    if (history.length === 0) {
      return { quality: 'fair' };
    }
    
    const avgLatency = history.reduce((sum, m) => sum + (m.latency || 0), 0) / history.length;
    const latest = history[history.length - 1];
    
    let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';
    if (avgLatency < 100) quality = 'excellent';
    else if (avgLatency < 300) quality = 'good';
    else if (avgLatency < 1000) quality = 'fair';
    else quality = 'poor';
    
    return {
      ...latest,
      averageLatency: avgLatency,
      quality
    };
  }

  async blacklistPeer(peerId: string, reason: string, duration?: number): Promise<void> {
    const until = duration ? Date.now() + duration : undefined;
    this.blacklist.set(peerId, { reason, until });
  }

  async isBlacklisted(peerId: string): Promise<boolean> {
    const entry = this.blacklist.get(peerId);
    if (!entry) return false;
    
    if (entry.until && Date.now() > entry.until) {
      this.blacklist.delete(peerId);
      return false;
    }
    
    return true;
  }

  private filterBlacklisted(nodes: Node[]): Node[] {
    return nodes.filter(n => !this.blacklist.has(n.peerId));
  }

  async addPreferredPeer(peerId: string, options: PreferredPeerOptions): Promise<void> {
    this.preferredPeers.set(peerId, options);
  }

  async getPreferredPeers(): Promise<Node[]> {
    const peers: Node[] = [];
    
    for (const [peerId, options] of this.preferredPeers.entries()) {
      const peerInfo = this.peerInfo.get(peerId);
      peers.push(peerInfo || { peerId });
    }
    
    return peers.sort((a, b) => {
      const aPriority = this.preferredPeers.get(a.peerId)?.priority || 0;
      const bPriority = this.preferredPeers.get(b.peerId)?.priority || 0;
      return bPriority - aPriority;
    });
  }

  async getRankedPeers(): Promise<PeerInfo[]> {
    const peers: PeerInfo[] = Array.from(this.peerInfo.values());
    
    return peers.sort((a, b) => {
      const aScore = (a.reputation?.score || 0.5) * 0.7 + 
                     (1 / ((a.metrics?.averageLatency || 1000) / 100)) * 0.3;
      const bScore = (b.reputation?.score || 0.5) * 0.7 + 
                     (1 / ((b.metrics?.averageLatency || 1000) / 100)) * 0.3;
      return bScore - aScore;
    });
  }
}