import type AuthManager from './AuthManager';
import type { 
  Node, PeerInfo, ReputationScore, ConnectionMetrics, 
  DiscoveryOptions as DiscoveryOpts, NetworkTopology, PreferredPeerOptions,
  Host, DiscoveryStats, DiscoverySourceStats, UnifiedDiscoveryOptions,
  SelectionStrategy, SelectionCriteria
} from '../types/discovery';
import HttpDiscoveryClient from '../discovery/HttpDiscoveryClient';
import HostSelector from '../discovery/HostSelector';

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
  
  // Unified discovery properties
  private httpClient?: HttpDiscoveryClient;
  private discoveryPriority = ['p2p-local', 'p2p-global', 'http'];
  private enabledSources = new Map([['p2p-local', true], ['p2p-global', true], ['http', true]]);
  private discoveryStats: Record<string, DiscoverySourceStats> = {};
  private totalDiscoveries = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private unifiedCacheTTL = 60000;
  private unifiedCache?: { hosts: Host[]; timestamp: number };
  private hostSelector = new HostSelector();

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
      if (options?.cacheTTL === undefined) {
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
    let nodes: Node[] = [];
    let lastError: any = null;
    
    if (this.p2pClient?.discoverGlobal) {
      try {
        nodes = await this.p2pClient.discoverGlobal();
      } catch (error) {
        lastError = error;
        // Fallback to bootstrap nodes
        if (this.p2pClient?.getBootstrapPeers) {
          try {
            const bootstrapNodes = await this.p2pClient.getBootstrapPeers();
            if (bootstrapNodes && bootstrapNodes.length > 0) {
              nodes = bootstrapNodes;
              lastError = null; // Only clear error if we got actual nodes
            }
          } catch (fallbackError) {
            // Keep the original error
          }
        }
        
        // If we still have an error, throw it
        if (lastError) {
          throw lastError;
        }
      }
    }

    if (options?.maxNodes) {
      nodes = nodes.slice(0, options.maxNodes);
    }

    return this.filterBlacklisted(nodes);
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

  // ============= Unified Discovery Interface =============

  async discoverAllHosts(options?: UnifiedDiscoveryOptions): Promise<Host[]> {
    // Debug logging
    if (process.env.NODE_ENV === 'test' && process.env.DEBUG_CACHE) {
      console.log('[DiscoverAllHosts] Called with options:', options);
      console.log('[DiscoverAllHosts] unifiedCache exists:', !!this.unifiedCache);
      console.log('[DiscoverAllHosts] unifiedCacheTTL:', this.unifiedCacheTTL);
    }
    
    if (!options?.forceRefresh && this.unifiedCache) {
      const age = Date.now() - this.unifiedCache.timestamp;
      if (process.env.NODE_ENV === 'test' && process.env.DEBUG_CACHE) {
        console.log('[DiscoverAllHosts] Cache age:', age, 'ms');
        console.log('[DiscoverAllHosts] Cache valid?:', age < this.unifiedCacheTTL);
      }
      if (age < this.unifiedCacheTTL) {
        this.cacheHits++;
        return this.applyGlobalFilters(this.unifiedCache.hosts, options);
      }
    }
    this.cacheMisses++;
    this.totalDiscoveries++;

    if (process.env.NODE_ENV === 'test' && process.env.DEBUG_CACHE) {
      console.log('[DiscoverAllHosts] Fetching from sources...');
      console.log('[DiscoverAllHosts] Discovery priority:', this.discoveryPriority);
      console.log('[DiscoverAllHosts] Enabled sources:', Array.from(this.enabledSources.entries()));
    }

    const allHosts = new Map<string, Host>();
    const promises = this.discoveryPriority
      .filter(s => this.enabledSources.get(s))
      .map(source => {
        const startTime = Date.now();
        return this.discoverFromSource(source)
          .then(hosts => {
            this.recordSourceStats(source, Date.now() - startTime, true);
            hosts.forEach(h => {
              if (!h.id) h.id = h.peerId || h.url || Math.random().toString();
              h.source = source;
              const existing = allHosts.get(h.id!);
              allHosts.set(h.id!, existing ? this.mergeHostInfo(existing, h) : h);
            });
          })
          .catch(() => this.recordSourceStats(source, Date.now() - startTime, false));
      });

    await Promise.allSettled(promises);
    let hosts = Array.from(allHosts.values());
    hosts = this.sortByPriority(hosts);
    hosts = this.applyGlobalFilters(hosts, options);
    this.unifiedCache = { hosts, timestamp: Date.now() };
    return hosts;
  }

  setDiscoveryPriority(order: string[]): void {
    this.discoveryPriority = order.filter(s => ['p2p-local', 'p2p-global', 'http'].includes(s));
  }

  enableDiscoverySource(source: string, enabled: boolean): void {
    this.enabledSources.set(source, enabled);
  }

  setCacheTTL(ttl: number): void { this.unifiedCacheTTL = ttl; }

  getDiscoveryStats(): DiscoveryStats {
    return {
      totalDiscoveries: this.totalDiscoveries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: this.totalDiscoveries > 0 ? 
        this.cacheHits / (this.cacheHits + this.cacheMisses) : 0,
      sourceStats: { ...this.discoveryStats }
    };
  }

  private async discoverFromSource(source: string): Promise<Host[]> {
    if (process.env.NODE_ENV === 'test' && process.env.DEBUG_CACHE) {
      console.log('[discoverFromSource] Called with source:', source);
      console.log('[discoverFromSource] p2pClient exists:', !!this.p2pClient);
    }
    switch (source) {
      case 'p2p-local': 
        if (process.env.NODE_ENV === 'test' && process.env.DEBUG_CACHE) {
          console.log('[discoverFromSource] Calling discoverLocalNodes...');
        }
        // Force refresh to bypass individual method caches
        return (await this.discoverLocalNodes({ cacheTTL: 0 })) as Host[];
      case 'p2p-global': 
        return (await this.discoverGlobalNodes({ cacheTTL: 0 })) as Host[];
      case 'http':
        if (!this.httpClient) this.httpClient = new HttpDiscoveryClient('https://discovery.fabstir.net');
        return await this.httpClient.discoverHosts();
      default: return [];
    }
  }

  private mergeHostInfo(existing: Host, newer: Host): Host {
    const newerTime = (newer as any).timestamp || Date.now();
    return newerTime >= ((existing as any).timestamp || 0) ? 
      { ...existing, ...newer } : { ...newer, ...existing };
  }

  private sortByPriority(hosts: Host[]): Host[] {
    const priorityMap = new Map(this.discoveryPriority.map((s, i) => [s, i]));
    return hosts.sort((a, b) => 
      (priorityMap.get(a.source || '') ?? 999) - (priorityMap.get(b.source || '') ?? 999)
    );
  }

  async selectHostForModel(model: string, strategy: SelectionStrategy = 'random'): Promise<Host | null> {
    // Get all available hosts
    const allHosts = await this.discoverAllHosts({ forceRefresh: false });
    
    // Filter hosts that support the requested model
    const compatibleHosts = allHosts.filter(host => {
      // Check if host has the model in its models array
      if (host.models?.includes(model)) return true;
      
      // Also check capabilities for backward compatibility
      if (host.capabilities?.includes(model)) return true;
      
      // Check if model is mentioned in any capability string
      return host.capabilities?.some(cap => cap.includes(model)) || false;
    });
    
    if (compatibleHosts.length === 0) {
      console.log(`No hosts found supporting model: ${model}`);
      return null;
    }
    
    // Use HostSelector to choose based on strategy
    const criteria: SelectionCriteria = {
      strategy,
      requiredModel: model
    };
    
    const selected = this.hostSelector.selectOptimalHost(compatibleHosts, criteria);
    
    if (selected) {
      console.log(`Selected host ${selected.id} for model ${model} using ${strategy} strategy`);
    }
    
    return selected;
  }

  private applyGlobalFilters(hosts: Host[], options?: UnifiedDiscoveryOptions): Host[] {
    if (!options) return hosts;
    let filtered = [...hosts];
    if (options.maxPrice !== undefined)
      filtered = filtered.filter(h => (h.pricePerToken || 0) <= options.maxPrice!);
    if (options.model)
      filtered = filtered.filter(h => h.models?.includes(options.model!));
    if (options.region)
      filtered = filtered.filter(h => h.region === options.region);
    if (options.minLatency !== undefined)
      filtered = filtered.filter(h => (h.latency || 0) >= options.minLatency!);
    if (options.maxLatency !== undefined)
      filtered = filtered.filter(h => (h.latency || Infinity) <= options.maxLatency!);
    return filtered;
  }

  private recordSourceStats(source: string, time: number, success: boolean): void {
    if (!this.discoveryStats[source]) {
      this.discoveryStats[source] = { attempts: 0, successes: 0, failures: 0, averageTime: 0 };
    }
    const stats = this.discoveryStats[source];
    stats.attempts++;
    if (success) {
      stats.successes++;
      stats.lastSuccess = Date.now();
    } else {
      stats.failures++;
      stats.lastFailure = Date.now();
    }
    stats.averageTime = (stats.averageTime * (stats.attempts - 1) + time) / stats.attempts;
  }
}