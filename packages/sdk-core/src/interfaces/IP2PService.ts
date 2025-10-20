// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * P2P Service Interface - Browser-compatible interface for P2P operations
 * Actual P2P implementation resides in sdk-node
 */

export interface P2PNode {
  id: string;
  address: string;
  capabilities?: string[];
  reputation?: number;
}

export interface P2PMessage {
  type: string;
  payload: any;
  from?: string;
  timestamp?: number;
}

export interface P2PDiscoveryResult {
  nodes: P2PNode[];
  source: 'local' | 'global' | 'dht';
}

export interface IP2PService {
  /**
   * Connect to P2P service (usually via WebSocket to sdk-node)
   */
  connect(endpoint: string): Promise<void>;
  
  /**
   * Disconnect from P2P service
   */
  disconnect(): Promise<void>;
  
  /**
   * Discover P2P nodes
   */
  discoverNodes(filter?: {
    capabilities?: string[];
    minReputation?: number;
  }): Promise<P2PDiscoveryResult>;
  
  /**
   * Send message to a peer
   */
  sendMessage(peerId: string, message: P2PMessage): Promise<void>;
  
  /**
   * Subscribe to messages
   */
  onMessage(handler: (message: P2PMessage) => void): void;
  
  /**
   * Get current P2P status
   */
  getStatus(): Promise<{
    connected: boolean;
    peerId?: string;
    connections: number;
  }>;
  
  /**
   * Check if service is available
   */
  isAvailable(): boolean;
}