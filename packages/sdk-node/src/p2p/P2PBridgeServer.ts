/**
 * P2P Bridge Server - WebSocket server that bridges browser clients to P2P network
 * Provides JSON-RPC interface for sdk-core clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { createLibp2p, Libp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { kadDHT } from '@libp2p/kad-dht';
import { mdns } from '@libp2p/mdns';
import { bootstrap } from '@libp2p/bootstrap';
import { P2PConfig, DiscoveredNode } from './types';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params: any;
  id: string | number;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

export class P2PBridgeServer extends EventEmitter {
  private wss?: WebSocketServer;
  private node?: Libp2p;
  private clients = new Map<string, WebSocket>();
  private config: P2PConfig;
  private running = false;
  
  constructor(config: P2PConfig = {}) {
    super();
    this.config = config;
  }
  
  async start(port: number = 8080): Promise<void> {
    if (this.running) {
      throw new Error('Server already running');
    }
    
    // Initialize P2P node
    await this.initializeP2PNode();
    
    // Start WebSocket server
    this.wss = new WebSocketServer({ port });
    
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);
      
      console.log(`Client connected: ${clientId}`);
      
      ws.on('message', async (data) => {
        try {
          const request = JSON.parse(data.toString()) as JSONRPCRequest;
          const response = await this.handleRequest(request, clientId);
          ws.send(JSON.stringify(response));
        } catch (error: any) {
          const errorResponse: JSONRPCResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
              data: error.message
            },
            id: 0
          };
          ws.send(JSON.stringify(errorResponse));
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
      });
      
      ws.on('error', (error) => {
        console.error(`Client error ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });
    
    this.running = true;
    console.log(`P2P Bridge Server listening on port ${port}`);
  }
  
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    // Close all client connections
    this.clients.forEach((ws) => {
      ws.close();
    });
    this.clients.clear();
    
    // Stop WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = undefined;
    }
    
    // Stop P2P node
    if (this.node) {
      await this.node.stop();
      this.node = undefined;
    }
    
    this.running = false;
    console.log('P2P Bridge Server stopped');
  }
  
  private async initializeP2PNode(): Promise<void> {
    const config: any = {
      addresses: {
        listen: this.config.listen || ['/ip4/127.0.0.1/tcp/0']
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      connectionManager: {
        minConnections: this.config.minConnections || 0,
        maxConnections: this.config.maxConnections || 10
      }
    };
    
    // Add DHT if enabled
    if (this.config.enableDHT) {
      config.dht = kadDHT();
    }
    
    // Add MDNS if enabled
    if (this.config.enableMDNS) {
      config.peerDiscovery = [mdns()];
    }
    
    // Add bootstrap nodes if provided
    if (this.config.bootstrapNodes?.length) {
      config.peerDiscovery = config.peerDiscovery || [];
      config.peerDiscovery.push(bootstrap({
        list: this.config.bootstrapNodes
      }));
    }
    
    this.node = await createLibp2p(config);
    await this.node.start();
    
    console.log('P2P node started with ID:', this.node.peerId.toString());
  }
  
  private async handleRequest(request: JSONRPCRequest, clientId: string): Promise<JSONRPCResponse> {
    try {
      let result: any;
      
      switch (request.method) {
        case 'discover':
          result = await this.handleDiscover(request.params);
          break;
          
        case 'sendMessage':
          result = await this.handleSendMessage(request.params);
          break;
          
        case 'getStatus':
          result = await this.handleGetStatus();
          break;
          
        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: 'Method not found',
              data: { method: request.method }
            },
            id: request.id
          };
      }
      
      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      };
      
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        },
        id: request.id
      };
    }
  }
  
  private async handleDiscover(params: any): Promise<any> {
    if (!this.node) {
      throw new Error('P2P node not initialized');
    }
    
    const peers = this.node.getPeers();
    const nodes: DiscoveredNode[] = [];
    
    for (const peerId of peers) {
      const connections = this.node.getConnections(peerId);
      if (connections.length > 0) {
        nodes.push({
          id: peerId.toString(),
          addresses: connections.map(c => c.remoteAddr.toString()),
          protocols: [] // Would need protocol negotiation to fill this
        });
      }
    }
    
    // Apply filters if provided
    let filteredNodes = nodes;
    if (params?.filter?.minReputation) {
      // Would need reputation system to filter
    }
    
    return {
      nodes: filteredNodes.map(n => ({
        id: n.id,
        address: n.addresses[0] || '',
        capabilities: params?.filter?.capabilities
      })),
      source: 'global'
    };
  }
  
  private async handleSendMessage(params: any): Promise<void> {
    if (!this.node) {
      throw new Error('P2P node not initialized');
    }
    
    const { peerId, message } = params;
    
    // In a real implementation, would establish a protocol stream and send the message
    // For now, just validate the peer exists
    const peers = this.node.getPeers();
    const peerExists = peers.some(p => p.toString() === peerId);
    
    if (!peerExists) {
      throw new Error(`Peer not found: ${peerId}`);
    }
    
    // Message would be sent here
    console.log(`Sending message to ${peerId}:`, message);
  }
  
  private async handleGetStatus(): Promise<any> {
    if (!this.node) {
      return {
        connected: false,
        connections: 0
      };
    }
    
    const peers = this.node.getPeers();
    
    return {
      connected: true,
      peerId: this.node.peerId.toString(),
      connections: peers.length
    };
  }
  
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Broadcast a P2P message to all connected clients
   */
  broadcastMessage(message: any): void {
    const notification = {
      type: 'p2p_message',
      data: message
    };
    
    const json = JSON.stringify(notification);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    });
  }
}