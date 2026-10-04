// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unified Bridge Client - Single client for all server-side features
 * Connects to sdk-node bridge server for P2P and proof generation
 */

import { P2PBridgeClient } from './P2PBridgeClient';
import { ProofBridgeClient, BRIDGE_TIMEOUT_MS } from './ProofBridgeClient';
import { SDKError } from '../types';
import { retryableOf } from '../storage/sealed/sealed-io';
import { fetchWithTimeout, withTimeout } from '../utils/with-timeout';

/** Every way a connect fails, in the one shape: `error` (kept for existing callers), `cause` and its verdict (§28 II8). */
const connectionFailed = (error: unknown) =>
  new SDKError('Failed to connect to bridge server', 'BRIDGE_CONNECTION_FAILED', { error, cause: error, retryable: retryableOf(error) });

export interface BridgeClientConfig {
  bridgeUrl: string;
  websocketUrl?: string;
  autoConnect?: boolean;
}

export class UnifiedBridgeClient {
  private config: BridgeClientConfig;
  private p2pClient: P2PBridgeClient;
  private proofClient: ProofBridgeClient;
  private connected = false;
  private healthCheckInterval?: number;
  /** Bumped by every `disconnect()`: a `connect()` still running when it comes is superseded (plan §27 HH8). */
  private disconnects = 0;
  /** The connect in flight, and the `disconnects` it began under (plan §29 JJ2). */
  private connecting?: { promise: Promise<void>; disconnects: number };
  /**
   * Bumped by every connection made: a health check spanning one judged another (plan §32 MM2). (A check spanning only a
   * close finds the client not connected, and stands down on that.)
   */
  private connections = 0;
  
  constructor(config: BridgeClientConfig, contractManager?: any) {
    this.config = config;
    this.p2pClient = new P2PBridgeClient();
    this.proofClient = new ProofBridgeClient(contractManager);
    
    if (config.autoConnect) {
      this.connect().catch(console.error);
    }
  }
  
  /**
   * Connect to bridge server — one connect at a time (plan §29 JJ2): a call while one runs shares it, unless a
   * `disconnect()` superseded that one; then this waits for it to settle (it closes what it opened — every step is
   * bounded, so it does) and starts afresh. No two ever hold the P2P socket. Any `disconnect()` after this call was
   * made supersedes it, even one that came while it waited (plan §30 KK1, §31 LL1).
   */
  async connect(): Promise<void> {
    const asked = this.disconnects;
    for (;;) {
      if (asked !== this.disconnects) {
        throw connectionFailed(new SDKError('A disconnect() superseded this connect()', 'BRIDGE_CLOSED', { retryable: false }));
      }
      if (this.connected) return;
      const running = this.connecting;
      if (!running) break;
      if (running.disconnects === asked) return running.promise;
      await running.promise.catch(() => undefined);
    }
    const attempt = { disconnects: asked, promise: Promise.resolve() };
    attempt.promise = this.connectOnce(attempt.disconnects);
    this.connecting = attempt;
    // A new attempt starts only once this one is cleared, so this one is the attempt in flight (§31 LL4).
    const settle = () => { this.connecting = undefined; };
    attempt.promise.then(settle, settle);
    return attempt.promise;
  }

  private async connectOnce(disconnects: number): Promise<void> {
    // Set once the socket is asked for: a failure from then on closes it, opened or still opening (§31 LL1).
    let socketAsked = false;
    // Before each step: a disconnect() since this attempt began (a sign-out) ends it there — it never opens a socket,
    // nor asks the proof service, after it (plan §27 HH8, §33 NN1).
    const stopIfSuperseded = () => {
      if (disconnects !== this.disconnects) {
        throw new SDKError('A disconnect() superseded this connect()', 'BRIDGE_CLOSED', { retryable: false });
      }
    };
    
    try {
      // Check bridge server health
      const health = await this.checkHealth();
      if (!health.healthy) {
        throw new Error('Bridge server not healthy');
      }
      stopIfSuperseded();
      
      // Connect P2P client via WebSocket
      const wsUrl = this.config.websocketUrl || 
        this.config.bridgeUrl.replace('http', 'ws') + '/ws';
      socketAsked = true;
      // Bounded (§31 LL1): a socket that never opens fails the connect, and is closed below.
      await withTimeout(this.p2pClient.connect(wsUrl), BRIDGE_TIMEOUT_MS,
        () => new SDKError('The bridge socket did not open in time', 'BRIDGE_TIMEOUT', { retryable: true }));
      stopIfSuperseded();
      
      // Connect proof client via HTTP
      const proofUrl = this.config.bridgeUrl + '/api/proof';
      await this.proofClient.connect(proofUrl);

      stopIfSuperseded();
      
      this.connected = true;
      this.connections++;
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      console.log('Connected to Unified Bridge Server');
      
    } catch (error) {
      // A connect that failed closes what it opened (plan §28 II9) — superseded or not; superseded, it says so
      // whatever step it was at (a sign-out may have closed its socket under it — §32 MM3).
      this.connected = false;
      if (socketAsked) await this.p2pClient.disconnect().catch(() => undefined);
      throw connectionFailed(disconnects !== this.disconnects
        ? new SDKError('A disconnect() superseded this connect()', 'BRIDGE_CLOSED', { retryable: false })
        : error);
    }
  }
  
  /** The bridge this client connects to — fixed for its life (`connectToBridge(url)` refuses another — §32 MM1). */
  getBridgeUrl(): string {
    return this.config.bridgeUrl;
  }

  /**
   * Disconnect from bridge server. It supersedes every `connect()` called before it (plan §30 KK1).
   */
  async disconnect(): Promise<void> {
    this.disconnects++;
    // An attempt in flight: the socket it opened closes now, not when it reaches its check (plan §32 MM3).
    if (this.connecting) await this.p2pClient.disconnect();
    if (!this.connected) {
      return;
    }
    await this.closeSocket();
    console.log('Disconnected from Unified Bridge Server');
  }

  /** Close the connection — the health monitor's own way down: never a `disconnect()`, which would supersede (§30 KK1). */
  private async closeSocket(): Promise<void> {
    this.stopHealthMonitoring();
    this.connected = false;
    await this.p2pClient.disconnect();
  }
  
  /**
   * Get P2P client for peer-to-peer operations
   */
  getP2PClient(): P2PBridgeClient {
    if (!this.connected) {
      throw new SDKError('Not connected to bridge server', 'BRIDGE_NOT_CONNECTED');
    }
    return this.p2pClient;
  }
  
  /**
   * Get proof client for EZKL proof generation
   */
  getProofClient(): ProofBridgeClient {
    if (!this.connected) {
      throw new SDKError('Not connected to bridge server', 'BRIDGE_NOT_CONNECTED');
    }
    return this.proofClient;
  }
  
  /**
   * Check if bridge services are available
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    services: {
      p2p: boolean;
      proof: boolean;
      websocket: boolean;
    };
  }> {
    try {
      // Bounded — its body too (plan §30 KK1, §31 LL1): a connect always settles, so one superseded never holds the next.
      const { response, data } = await fetchWithTimeout(`${this.config.bridgeUrl}/health`, {}, BRIDGE_TIMEOUT_MS,
        async (res) => ({ response: res, data: res.ok ? await res.json() : undefined }));
      
      if (!response.ok) {
        return {
          healthy: false,
          services: {
            p2p: false,
            proof: false,
            websocket: false
          }
        };
      }
      
      return {
        healthy: data.status === 'healthy',
        services: {
          p2p: data.services?.p2p === 'available',
          proof: data.services?.proof === 'available',
          websocket: data.services?.websocket === 'available'
        }
      };
      
    } catch (error) {
      return {
        healthy: false,
        services: {
          p2p: false,
          proof: false,
          websocket: false
        }
      };
    }
  }
  
  /**
   * Get bridge server info
   */
  async getServerInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.config.bridgeUrl}/info`);
      
      if (!response.ok) {
        throw new Error('Failed to get server info');
      }
      
      return await response.json();
      
    } catch (error) {
      throw new SDKError('Failed to get server info', 'BRIDGE_INFO_FAILED', { error });
    }
  }
  
  /**
   * Check if connected to bridge
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * Check if P2P service is available
   */
  isP2PAvailable(): boolean {
    return this.connected && this.p2pClient.isAvailable();
  }
  
  /**
   * Check if proof service is available
   */
  isProofAvailable(): boolean {
    return this.connected && this.proofClient.isAvailable();
  }
  
  private startHealthMonitoring(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = window.setInterval(() => { void this.healthTick(); }, 30000);
  }

  /**
   * One health check of the monitor. A `disconnect()`, or a new connection (the monitor's own reconnect included),
   * during it makes its answer stale — the connection it judged is gone: it stands down (§31 LL1, §32 MM2).
   */
  private async healthTick(): Promise<void> {
    const disconnects = this.disconnects;
    const connections = this.connections;
    try {
      const health = await this.checkHealth();
      if (!health.healthy && this.connected && disconnects === this.disconnects && connections === this.connections) {
        console.warn('Bridge server became unhealthy, reconnecting...');
        await this.reconnect();
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }
  
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
  
  /**
   * The health monitor's recovery. It closes the socket privately — never a `disconnect()`, which would supersede a
   * connect the UI is running — and stands down, its retry too, once a `disconnect()` came (a sign-out) or the client is
   * connected or connecting again (plan §29 JJ2, §30 KK1).
   */
  private async reconnect(): Promise<void> {
    const disconnects = this.disconnects;
    const standDown = () => disconnects !== this.disconnects || this.connected || this.connecting !== undefined;
    await this.closeSocket();
    
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (standDown()) return;
    
    try {
      await this.connect();
    } catch (error) {
      console.error('Failed to reconnect:', error);
      
      // Try again after longer delay
      setTimeout(() => {
        if (standDown()) return;
        this.reconnect().catch(console.error);
      }, 10000);
    }
  }
}