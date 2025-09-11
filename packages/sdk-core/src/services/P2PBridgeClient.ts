/**
 * P2P Bridge Client - Browser-compatible WebSocket client
 * Communicates with sdk-node P2P service
 */

import { IP2PService, P2PNode, P2PMessage, P2PDiscoveryResult } from '../interfaces/IP2PService';
import { SDKError } from '../types';

export class P2PBridgeClient implements IP2PService {
  private ws?: WebSocket;
  private endpoint?: string;
  private connected = false;
  private messageHandlers: Set<(message: P2PMessage) => void> = new Set();
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
  private requestId = 0;
  
  async connect(endpoint: string): Promise<void> {
    if (this.connected) {
      throw new SDKError('Already connected to P2P service', 'P2P_ALREADY_CONNECTED');
    }
    
    this.endpoint = endpoint;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(endpoint);
        
        this.ws.onopen = () => {
          this.connected = true;
          resolve();
        };
        
        this.ws.onerror = (error) => {
          this.connected = false;
          reject(new SDKError('Failed to connect to P2P service', 'P2P_CONNECTION_FAILED', { error }));
        };
        
        this.ws.onclose = () => {
          this.connected = false;
          this.cleanup();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
      } catch (error) {
        reject(new SDKError('Failed to create WebSocket connection', 'P2P_WS_CREATION_FAILED', { error }));
      }
    });
  }
  
  async disconnect(): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }
    
    this.ws.close();
    this.connected = false;
    this.cleanup();
  }
  
  async discoverNodes(filter?: {
    capabilities?: string[];
    minReputation?: number;
  }): Promise<P2PDiscoveryResult> {
    if (!this.connected) {
      throw new SDKError('Not connected to P2P service', 'P2P_NOT_CONNECTED');
    }
    
    return this.sendRequest('discover', { filter });
  }
  
  async sendMessage(peerId: string, message: P2PMessage): Promise<void> {
    if (!this.connected) {
      throw new SDKError('Not connected to P2P service', 'P2P_NOT_CONNECTED');
    }
    
    return this.sendRequest('sendMessage', { peerId, message });
  }
  
  onMessage(handler: (message: P2PMessage) => void): void {
    this.messageHandlers.add(handler);
  }
  
  async getStatus(): Promise<{
    connected: boolean;
    peerId?: string;
    connections: number;
  }> {
    if (!this.connected) {
      return {
        connected: false,
        connections: 0
      };
    }
    
    return this.sendRequest('getStatus', {});
  }
  
  isAvailable(): boolean {
    return this.connected;
  }
  
  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.ws || !this.connected) {
      throw new SDKError('WebSocket not connected', 'P2P_NOT_CONNECTED');
    }
    
    const id = `${++this.requestId}`;
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      try {
        this.ws!.send(JSON.stringify(request));
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new SDKError('Request timeout', 'P2P_REQUEST_TIMEOUT', { method, id }));
          }
        }, 30000);
        
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(new SDKError('Failed to send request', 'P2P_SEND_FAILED', { error, method }));
      }
    });
  }
  
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Handle JSON-RPC responses
      if (message.jsonrpc === '2.0' && message.id) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            pending.reject(new SDKError(
              message.error.message || 'P2P request failed',
              'P2P_REQUEST_ERROR',
              message.error
            ));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }
      
      // Handle P2P messages (notifications)
      if (message.type === 'p2p_message') {
        const p2pMessage: P2PMessage = message.data;
        this.messageHandlers.forEach(handler => {
          try {
            handler(p2pMessage);
          } catch (error) {
            console.error('Error in P2P message handler:', error);
          }
        });
      }
      
    } catch (error) {
      console.error('Failed to parse P2P message:', error);
    }
  }
  
  private cleanup(): void {
    // Reject all pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new SDKError('Connection closed', 'P2P_CONNECTION_CLOSED'));
    });
    this.pendingRequests.clear();
    
    // Clear handlers
    this.messageHandlers.clear();
    
    // Clear WebSocket
    this.ws = undefined;
    this.endpoint = undefined;
  }
}