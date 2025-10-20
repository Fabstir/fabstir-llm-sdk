// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unified Bridge Client - Single client for all server-side features
 * Connects to sdk-node bridge server for P2P and proof generation
 */

import { P2PBridgeClient } from './P2PBridgeClient';
import { ProofBridgeClient } from './ProofBridgeClient';
import { SDKError } from '../types';

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
  
  constructor(config: BridgeClientConfig, contractManager?: any) {
    this.config = config;
    this.p2pClient = new P2PBridgeClient();
    this.proofClient = new ProofBridgeClient(contractManager);
    
    if (config.autoConnect) {
      this.connect().catch(console.error);
    }
  }
  
  /**
   * Connect to bridge server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    
    try {
      // Check bridge server health
      const health = await this.checkHealth();
      if (!health.healthy) {
        throw new Error('Bridge server not healthy');
      }
      
      // Connect P2P client via WebSocket
      const wsUrl = this.config.websocketUrl || 
        this.config.bridgeUrl.replace('http', 'ws') + '/ws';
      await this.p2pClient.connect(wsUrl);
      
      // Connect proof client via HTTP
      const proofUrl = this.config.bridgeUrl + '/api/proof';
      await this.proofClient.connect(proofUrl);
      
      this.connected = true;
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      console.log('Connected to Unified Bridge Server');
      
    } catch (error) {
      throw new SDKError(
        'Failed to connect to bridge server',
        'BRIDGE_CONNECTION_FAILED',
        { error }
      );
    }
  }
  
  /**
   * Disconnect from bridge server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    
    // Stop health monitoring
    this.stopHealthMonitoring();
    
    // Disconnect clients
    await this.p2pClient.disconnect();
    
    this.connected = false;
    console.log('Disconnected from Unified Bridge Server');
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
      const response = await fetch(`${this.config.bridgeUrl}/health`);
      
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
      
      const data = await response.json();
      
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
    this.healthCheckInterval = window.setInterval(async () => {
      try {
        const health = await this.checkHealth();
        
        if (!health.healthy && this.connected) {
          console.warn('Bridge server became unhealthy, reconnecting...');
          await this.reconnect();
        }
        
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, 30000);
  }
  
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
  
  private async reconnect(): Promise<void> {
    await this.disconnect();
    
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      await this.connect();
    } catch (error) {
      console.error('Failed to reconnect:', error);
      
      // Try again after longer delay
      setTimeout(() => {
        this.reconnect().catch(console.error);
      }, 10000);
    }
  }
}